// Agente de lançamentos pelo WhatsApp: recebe o aviso da Meta, responde 200 na
// hora e processa cada mensagem em segundo plano.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { encodeBase64 } from 'jsr:@std/encoding@1.0.10/base64';
import { esquemaExtracao, montarLinhas, PERFIS, type Extraido, type Linha } from '../_shared/lancamento.ts';
import { hojeSP, diaDaSemanaSP } from '../_shared/comum.ts';
import type { Parte } from '../_shared/gemini.ts';
import { instrucoes } from './prompt.ts';
import * as R from './respostas.ts';
import { primeiroNome } from './respostas.ts';
import { assinaturaValida } from './meta.ts';

export interface Deps {
  db: SupabaseClient;
  appSecret: string;
  verifyToken: string;
  phoneNumberId?: string;
  gerarJson: (o: { sistema: string; partes: Parte[]; esquema: unknown }) => Promise<{ dados: { lancamentos?: Extraido[]; resposta?: string | null }; modelo: string }>;
  baixarMidia: (id: string) => Promise<{ bytes: Uint8Array; mime: string }>;
  enviarTexto: (phoneNumberId: string, para: string, texto: string, citar?: string) => Promise<void>;
  marcarLido?: (phoneNumberId: string, messageId: string) => Promise<void>;
  agora?: () => Date;
  waitUntil: (p: Promise<unknown>) => void;
  log?: (...a: unknown[]) => void;
}

// deno-lint-ignore no-explicit-any
type Msg = any;

const CODIGO = /^(?:vincular\s+)?([0-9a-f]{8})$/i;
const SAUDACAO = /^(ajuda|menu|help|oi+e?|ol[aá]|e a[ií]|bom dia|boa tarde|boa noite|\/start)[!?. ]*$/i;
const AGRADECIMENTO = /^(obrigad[oa]|obg|brigad[oa]|valeu|vlw|show|top|perfeito|beleza|blz|ok|certo|👍|🙏)[!. ]*$/iu;
const MIME_ACEITO = /^(image\/(jpeg|png|webp|heic|heif)|audio\/.+|application\/pdf)/i;

export function criarHandler(d: Deps) {
  const log = d.log ?? console.error;
  const agora = d.agora ?? (() => new Date());

  async function processar(msg: Msg, phoneNumberId: string): Promise<void> {
    const phone = String(msg.from || ''), id = String(msg.id || '');
    if (!/^[0-9]{8,15}$/.test(phone) || !id || msg.type === 'reaction') return;
    // Respostas aparecem ligadas à mensagem da pessoa, como numa conversa.
    const responder = (t: string, citar = true) => d.enviarTexto(phoneNumberId, phone, t, citar ? id : undefined);

    // Reenvio da Meta: a chave primária barra a segunda vez.
    const ins = await d.db.from('whatsapp_mensagens').insert({ message_id: id, phone });
    if (ins.error) { if (ins.error.code === '23505') return; throw ins.error; }
    // Tiques azuis e "digitando…" enquanto o agente trabalha.
    if (d.marcarLido) await d.marcarLido(phoneNumberId, id).catch(e => log('marcar lido', e));
    const marcar = (status: string, extra: Record<string, unknown> = {}) =>
      d.db.from('whatsapp_mensagens').update({ status, ...extra }).eq('message_id', id);
    const desde = (horas: number) => new Date(agora().getTime() - horas * 3600_000).toISOString();
    const contar = async (status: string, horas: number) => {
      const { count } = await d.db.from('whatsapp_mensagens').select('message_id', { count: 'exact', head: true })
        .eq('phone', phone).eq('status', status).gte('created_at', desde(horas));
      return count ?? 0;
    };
    const nomeDe = async (userId: string, perfil: string) => {
      const { data } = await d.db.from('workspace_members').select('display_name,email').eq('user_id', userId).limit(1).maybeSingle();
      return primeiroNome(data?.display_name || data?.email, PERFIS[perfil]?.curto ?? '');
    };

    const texto = String(msg.type === 'text' ? msg.text?.body ?? '' : msg.image?.caption ?? msg.document?.caption ?? '').trim();
    const { data: vinc, error: e1 } = await d.db.from('whatsapp_vinculos')
      .select('workspace_id,user_id,profile').eq('phone', phone).maybeSingle();
    if (e1) throw e1;

    // ---------- Vínculo do número ----------
    const cod = msg.type === 'text' ? texto.match(CODIGO) : null;
    if (cod) {
      if (await contar('vinculo_falhou', 1) >= 5) { await marcar('bloqueado'); return; }
      const { data: c } = await d.db.from('whatsapp_codigos').select('workspace_id,user_id,profile')
        .eq('codigo', cod[1].toUpperCase()).gt('expires_at', agora().toISOString()).maybeSingle();
      if (!c) {
        await marcar('vinculo_falhou');
        await responder(R.codigoInvalido());
        return;
      }
      await d.db.from('whatsapp_vinculos').delete().or(`phone.eq.${phone},user_id.eq.${c.user_id}`);
      const { error } = await d.db.from('whatsapp_vinculos').insert({ phone, workspace_id: c.workspace_id, user_id: c.user_id, profile: c.profile });
      if (error) throw error;
      await d.db.from('whatsapp_codigos').delete().eq('codigo', cod[1].toUpperCase());
      await marcar('vinculado', { workspace_id: c.workspace_id });
      await responder(R.boasVindas(await nomeDe(c.user_id, c.profile), c.profile), false);
      return;
    }
    if (!vinc) {
      const jaAvisado = await contar('nao_vinculado', 6);
      await marcar('nao_vinculado');
      if (!jaAvisado) await responder(R.naoVinculado(), false);
      return;
    }
    await marcar('recebida', { workspace_id: vinc.workspace_id });
    const nome = await nomeDe(vinc.user_id, vinc.profile);
    nomes.set(id, nome);

    // ---------- Comandos ----------
    if (msg.type === 'text' && /^desfazer[!. ]*$/i.test(texto)) {
      const { data: ult } = await d.db.from('whatsapp_mensagens').select('message_id,entry_ids')
        .eq('phone', phone).eq('status', 'lancada').gte('created_at', desde(24))
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!ult) { await marcar('desfazer'); await responder(R.nadaParaDesfazer(nome)); return; }
      const { data: apagadas } = await d.db.from('entries').select('cat,val')
        .eq('workspace_id', vinc.workspace_id).in('id', ult.entry_ids);
      const { error } = await d.db.from('entries').update({ deleted_at: agora().toISOString() })
        .eq('workspace_id', vinc.workspace_id).in('id', ult.entry_ids);
      if (error) throw error;
      await d.db.from('whatsapp_mensagens').update({ status: 'desfeita' }).eq('message_id', ult.message_id);
      await marcar('desfazer');
      await responder(R.desfeito(nome, apagadas ?? []));
      return;
    }
    if (msg.type === 'text' && SAUDACAO.test(texto)) { await marcar('ajuda'); await responder(R.ajuda(nome, id), false); return; }
    if (msg.type === 'text' && AGRADECIMENTO.test(texto)) { await marcar('ajuda'); await responder(R.agradecimento(nome, id), false); return; }

    // ---------- Leitura pelo Gemini ----------
    const partes: Parte[] = [];
    const midia = msg.image || msg.audio || msg.document;
    if (midia) {
      // Ler mídia leva alguns segundos: avisa que recebeu, como uma pessoa faria.
      await responder(R.recebendo(nome, msg.audio ? 'audio' : 'midia', id)).catch(e => log('aviso de recebimento', e));
      const { bytes, mime } = await d.baixarMidia(midia.id);
      const tipo = (mime || midia.mime_type || '').split(';')[0].trim();
      if (!MIME_ACEITO.test(tipo)) { await marcar('nao_suportado'); await responder(R.formatoNaoSuportado(nome)); return; }
      partes.push({ inlineData: { mimeType: tipo, data: encodeBase64(bytes) } });
      partes.push({ text: msg.audio ? 'Áudio enviado pela pessoa. Ouça e interprete.' : 'Comprovante enviado pela pessoa.' });
    } else if (msg.type !== 'text') {
      await marcar('nao_suportado');
      await responder(R.formatoNaoSuportado(nome));
      return;
    }
    if (texto) partes.push({ text: `Mensagem: ${texto}` });

    const hoje = hojeSP(agora());
    const { dados, modelo } = await d.gerarJson({ sistema: instrucoes(vinc.profile, hoje, diaDaSemanaSP(agora()), nome), partes, esquema: esquemaExtracao() });
    const extraidos = Array.isArray(dados.lancamentos) ? dados.lancamentos.slice(0, 5) : [];
    if (!extraidos.length) {
      await marcar('sem_lancamento');
      await responder(dados.resposta || `Não encontrei um gasto ou recebimento aqui, ${nome} 🤔 Me conta o valor e a forma de pagamento?`);
      return;
    }

    const grupos: Linha[][] = [], problemas: string[] = [];
    for (const e of extraidos) {
      try { grupos.push(montarLinhas(e, hoje)); } catch (err) { problemas.push((err as Error).message); }
    }
    if (!grupos.length) {
      await marcar('sem_lancamento');
      await responder(`${problemas[0]} Me manda de novo com o valor, a forma de pagamento e do que se trata, ${nome}?`);
      return;
    }
    const linhas = grupos.flat();
    const { error } = await d.db.from('entries').insert(linhas.map(l => ({
      ...l, workspace_id: vinc.workspace_id, created_by: vinc.user_id, origem: 'whatsapp'
    })));
    if (error) throw error;
    await marcar('lancada', { entry_ids: linhas.map(l => l.id) });
    log(`lançado via ${modelo}: ${linhas.length} linha(s)`);
    const contexto = grupos.length === 1 ? await contextoDoMes(vinc.workspace_id, grupos[0][0]).catch(() => null) : null;
    await responder(R.confirmacao({ nome, grupos, hoje, semente: id, contexto, problemas }));
  }

  /** Quanto a categoria já soma no mês do lançamento, para dar contexto na resposta. */
  async function contextoDoMes(ws: string, r: Linha): Promise<R.Contexto> {
    const ini = r.venc.slice(0, 8) + '01', fim = r.venc.slice(0, 8) + '31';
    const { data, error } = await d.db.from('entries').select('val')
      .eq('workspace_id', ws).eq('profile', r.profile).eq('kind', r.kind).eq('cat', r.cat)
      .is('deleted_at', null).gte('venc', ini).lte('venc', fim);
    if (error) throw error;
    const vals = (data ?? []) as { val: number | string }[];
    return { totalCategoria: vals.reduce((s, x) => s + Number(x.val), 0), qtdCategoria: vals.length };
  }

  // Nome de quem mandou cada mensagem, para a mensagem de erro também sair pessoal.
  const nomes = new Map<string, string>();

  async function processarSeguro(msg: Msg, phoneNumberId: string) {
    const id = String(msg?.id);
    try { await processar(msg, phoneNumberId); } catch (e) {
      log('erro ao processar mensagem', id, e);
      try {
        await d.db.from('whatsapp_mensagens').update({ status: 'erro' }).eq('message_id', id);
        await d.enviarTexto(phoneNumberId, String(msg.from), R.falhaTemporaria(nomes.get(id) ?? ''), id);
      } catch { /* sem como avisar */ }
    } finally { nomes.delete(id); }
  }

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (req.method === 'GET') {
      // Verificação do webhook, feita uma vez pela Meta ao configurar.
      const ok = url.searchParams.get('hub.mode') === 'subscribe' && !!d.verifyToken
        && url.searchParams.get('hub.verify_token') === d.verifyToken;
      return ok ? new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 }) : new Response('proibido', { status: 403 });
    }
    if (req.method !== 'POST') return new Response('método não permitido', { status: 405 });

    const bruto = await req.text();
    if (!await assinaturaValida(bruto, req.headers.get('x-hub-signature-256'), d.appSecret)) {
      return new Response('assinatura inválida', { status: 401 });
    }
    let corpo: Msg;
    try { corpo = JSON.parse(bruto); } catch { return new Response('json inválido', { status: 400 }); }

    const tarefas: Promise<void>[] = [];
    for (const entry of corpo.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const v = change.value;
        const pid = v?.metadata?.phone_number_id;
        if (!v?.messages || !pid || (d.phoneNumberId && pid !== d.phoneNumberId)) continue;
        for (const msg of v.messages) tarefas.push(processarSeguro(msg, pid));
      }
    }
    d.waitUntil(Promise.all(tarefas));
    return new Response('ok', { status: 200 });
  };
}
