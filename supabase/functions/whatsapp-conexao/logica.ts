// Conexão do WhatsApp pelo site. Cada pessoa logada conecta o próprio número
// sozinha: o site pede um QR Code (ou um código de pareamento, para quem está
// no celular), acompanha até conectar e pode trocar o perfil ou desconectar.
// Ninguém precisa liberar nada: basta estar logado num espaço.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { encodeHex } from 'jsr:@std/encoding@1.0.10/hex';
import { PERFIS } from '../_shared/lancamento.ts';
import type { Evolution } from '../_shared/evolution.ts';
import { finalizarConexao, type Conexao } from '../whatsapp/logica.ts';

export interface Deps {
  db: SupabaseClient;
  evo: Evolution;
  /** Endereço público da função "whatsapp", que recebe os avisos. */
  urlWebhook: string;
  origens?: string[];
  agora?: () => Date;
  log?: (...a: unknown[]) => void;
  espera?: (ms: number) => Promise<void>;
}

const aleatorio = (bytes: number) => encodeHex(crypto.getRandomValues(new Uint8Array(bytes)));
const COLUNAS = 'user_id,workspace_id,profile,instancia,segredo,estado,phone,jids,atualizado';

export function criarHandler(d: Deps) {
  const log = d.log ?? console.error;
  const agora = d.agora ?? (() => new Date());
  const espera = d.espera ?? (ms => new Promise(r => setTimeout(r, ms)));

  const cors = (req: Request) => {
    const origem = req.headers.get('origin') ?? '';
    const permitida = !d.origens?.length || d.origens.includes(origem) ? origem || '*' : d.origens[0];
    return {
      'Access-Control-Allow-Origin': permitida,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin'
    };
  };

  return async (req: Request): Promise<Response> => {
    const json = (corpo: unknown, status = 200) =>
      new Response(JSON.stringify(corpo), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    if (req.method !== 'POST') return json({ erro: 'metodo' }, 405);

    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u, error: eu } = token ? await d.db.auth.getUser(token) : { data: { user: null }, error: null };
    if (eu || !u?.user) return json({ erro: 'nao_autenticado' }, 401);
    const user = u.user;
    const { data: membro } = await d.db.from('workspace_members').select('workspace_id').eq('user_id', user.id).limit(1).maybeSingle();
    if (!membro) return json({ erro: 'sem_espaco' }, 403);
    const ws = membro.workspace_id as string;

    // deno-lint-ignore no-explicit-any
    let pedido: any = {};
    try { pedido = await req.json(); } catch { /* vazio */ }
    const acao = String(pedido.acao || '');
    const numero = String(pedido.numero || '').replace(/\D/g, '');
    if (numero && !/^[0-9]{10,15}$/.test(numero)) return json({ erro: 'numero_invalido' }, 400);

    const { data: atual, error: ea } = await d.db.from('whatsapp_conexoes').select(COLUNAS).eq('user_id', user.id).maybeSingle();
    if (ea) return json({ erro: 'banco' }, 500);
    const cx = atual as (Conexao & { atualizado: string }) | null;
    const publico = (c: Conexao | null, extra: Record<string, unknown> = {}) =>
      ({ estado: c ? c.estado : 'nenhuma', phone: c?.phone ?? null, perfil: c?.profile ?? null, ...extra });

    try {
      if (acao === 'estado') {
        if (!cx) return json(publico(null));
        const s = await d.evo.estado(cx.instancia);
        if (cx.estado === 'conectado') {
          if (s !== 'open') {
            await d.db.from('whatsapp_conexoes').update({ estado: 'desconectado', atualizado: agora().toISOString() }).eq('user_id', user.id);
            cx.estado = 'desconectado';
          }
          return json(publico(cx));
        }
        if (s === 'open') {
          const phone = await d.evo.dono(cx.instancia);
          if (phone) await finalizarConexao(d, cx, phone);
          return json(publico(cx, cx.estado === 'conectado' ? {} : { conectando: true }));
        }
        if (s === 'connecting') return json(publico(cx, { qr: await d.evo.qr(cx.instancia, numero || undefined) }));
        return json(publico(cx, { expirado: true }));
      }

      if (acao === 'conectar') {
        const perfil = String(pedido.perfil || cx?.profile || '');
        if (!PERFIS[perfil]) return json({ erro: 'perfil_invalido' }, 400);
        if (cx && agora().getTime() - new Date(cx.atualizado).getTime() < 8000) return json({ erro: 'aguarde' }, 429);
        // Começa do zero: apaga a conexão antiga, se houver, e cria outra.
        if (cx) await d.evo.apagar(cx.instancia).catch(e => log('apagar antiga', e));
        await d.db.from('whatsapp_vinculos').delete().eq('user_id', user.id);
        const nova: Conexao = {
          user_id: user.id, workspace_id: ws, profile: perfil,
          instancia: `cfi-${user.id.slice(0, 8)}-${aleatorio(4)}`, segredo: aleatorio(24),
          estado: 'aguardando', phone: null, jids: []
        };
        const { error } = await d.db.from('whatsapp_conexoes').upsert({ ...nova, atualizado: agora().toISOString() }, { onConflict: 'user_id' });
        if (error) throw error;
        const url = `${d.urlWebhook}?i=${nova.instancia}&t=${nova.segredo}`;
        let qr = await d.evo.criar(nova.instancia, url, numero || undefined);
        // O código de pareamento sai um instante depois do primeiro QR.
        for (let i = 0; numero && !qr.codigo && i < 3; i++) { await espera(2000); qr = await d.evo.qr(nova.instancia, numero); }
        if (!qr.base64 && !qr.codigo) { await espera(2000); qr = await d.evo.qr(nova.instancia, numero || undefined); }
        return json(publico(nova, { qr }));
      }

      if (acao === 'perfil') {
        const perfil = String(pedido.perfil || '');
        if (!cx) return json({ erro: 'sem_conexao' }, 404);
        if (!PERFIS[perfil]) return json({ erro: 'perfil_invalido' }, 400);
        await d.db.from('whatsapp_conexoes').update({ profile: perfil }).eq('user_id', user.id);
        await d.db.from('whatsapp_vinculos').update({ profile: perfil }).eq('user_id', user.id);
        return json(publico({ ...cx, profile: perfil }));
      }

      if (acao === 'desconectar') {
        if (cx) await d.evo.apagar(cx.instancia);
        await d.db.from('whatsapp_vinculos').delete().eq('user_id', user.id);
        await d.db.from('whatsapp_conexoes').delete().eq('user_id', user.id);
        return json(publico(null));
      }

      return json({ erro: 'acao_invalida' }, 400);
    } catch (e) {
      log('conexão whatsapp', acao, e);
      const msg = String((e as Error)?.message || '');
      return json({ erro: msg === 'evolution_nao_configurada' ? 'servidor_nao_configurado' : 'servidor_indisponivel' }, 502);
    }
  };
}
