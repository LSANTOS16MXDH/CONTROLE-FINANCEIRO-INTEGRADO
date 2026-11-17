// CFO: o site envia a pergunta; a função confere quem é, monta o resumo
// financeiro do espaço e conversa com o Gemini usando ferramentas de consulta.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { carregarDados, hojeSP, diaDaSemanaSP } from '../_shared/comum.ts';
import { resumir, ferramentas, executarFerramenta } from '../_shared/resumo.ts';
import { carregarPerfis } from '../_shared/perfis.ts';
import type { Conteudo, Json } from '../_shared/gemini.ts';
import { instrucoesCFO } from './prompt.ts';

export interface Deps {
  db: SupabaseClient;
  conversar: (o: {
    sistema: string; historico: Conteudo[]; ferramentas: ReturnType<typeof ferramentas>;
    executar: (nome: string, args: Json) => Promise<Json>;
  }) => Promise<{ texto: string; modelo: string; passos: number }>;
  agora?: () => Date;
  origens?: string[];
  log?: (...a: unknown[]) => void;
}

const LIMITE_HORA = 30;      // perguntas por espaço por hora
const HISTORICO = 20;        // mensagens anteriores enviadas ao modelo
const TAMANHO_MAX = 4000;    // caracteres por pergunta

export function criarHandler(d: Deps) {
  const log = d.log ?? console.error;
  const agora = d.agora ?? (() => new Date());

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
  const json = (req: Request, corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    if (req.method !== 'POST') return json(req, { erro: 'método não permitido' }, 405);

    // Quem pergunta: o token de login do site, conferido no servidor de autenticação.
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u, error: eu } = token ? await d.db.auth.getUser(token) : { data: { user: null }, error: null };
    if (eu || !u?.user) return json(req, { erro: 'nao_autenticado' }, 401);
    const user = u.user;

    const { data: membro } = await d.db.from('workspace_members').select('workspace_id,display_name,email')
      .eq('user_id', user.id).maybeSingle();
    if (!membro) return json(req, { erro: 'sem_espaco' }, 403);
    const ws = membro.workspace_id as string;

    let pergunta = '';
    try { pergunta = String((await req.json()).pergunta ?? '').trim(); } catch { /* corpo inválido */ }
    if (!pergunta) return json(req, { erro: 'pergunta_vazia' }, 400);
    if (pergunta.length > TAMANHO_MAX) return json(req, { erro: 'pergunta_longa' }, 400);

    const umaHora = new Date(agora().getTime() - 3600_000).toISOString();
    const { count } = await d.db.from('cfo_mensagens').select('id', { count: 'exact', head: true })
      .eq('workspace_id', ws).eq('papel', 'user').gte('created_at', umaHora);
    if ((count ?? 0) >= LIMITE_HORA) return json(req, { erro: 'limite' }, 429);

    const { data: anteriores } = await d.db.from('cfo_mensagens').select('papel,texto')
      .eq('workspace_id', ws).order('created_at', { ascending: false }).limit(HISTORICO);
    const idPergunta = crypto.randomUUID();
    const { error: ei } = await d.db.from('cfo_mensagens').insert({ id: idPergunta, workspace_id: ws, user_id: user.id, papel: 'user', texto: pergunta });
    if (ei) { log(ei); return json(req, { erro: 'falha' }, 500); }

    const quem = membro.display_name || membro.email || 'um membro';
    const historico: Conteudo[] = (anteriores ?? []).reverse().map(m => ({
      role: m.papel === 'cfo' ? 'model' : 'user', parts: [{ text: m.texto }]
    }));
    historico.push({ role: 'user', parts: [{ text: pergunta }] });

    try {
      const [{ linhas, alvos }, perfis] = await Promise.all([carregarDados(d.db, ws), carregarPerfis(d.db, ws)]);
      const hoje = hojeSP(agora());
      const resumo = JSON.stringify(resumir(linhas, alvos, hoje, perfis));
      const { texto, modelo, passos } = await d.conversar({
        sistema: instrucoesCFO(resumo, hoje, diaDaSemanaSP(agora()), quem, perfis),
        historico,
        ferramentas: ferramentas(perfis),
        executar: async (nome, args) => executarFerramenta(nome, args, linhas, hoje)
      });
      const { error } = await d.db.from('cfo_mensagens').insert({ workspace_id: ws, user_id: null, papel: 'cfo', texto: texto.slice(0, 20000) });
      if (error) log(error);
      return json(req, { texto, modelo, passos });
    } catch (e) {
      log('erro no CFO', e);
      // Sem resposta, a pergunta sai da conversa: o site devolve o texto ao campo para reenviar.
      await d.db.from('cfo_mensagens').delete().eq('id', idPergunta);
      const status = (e as { status?: number }).status;
      return json(req, { erro: status === 429 ? 'cota' : 'falha' }, 502);
    }
  };
}
