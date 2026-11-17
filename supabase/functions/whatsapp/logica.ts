// Agente de lançamentos pelo WhatsApp, via Evolution API.
//
// Cada pessoa conecta o próprio WhatsApp pelo site (QR Code ou código de
// pareamento). O servidor da Evolution avisa esta função de cada mensagem; o
// agente só lê o que a pessoa escreve na conversa "Você" (mensagens para si
// mesma) e responde ali. Qualquer outra conversa é descartada sem ser gravada.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { esquemaExtracao, montarLinhas, PERFIS, type Extraido, type Linha } from '../_shared/lancamento.ts';
import { hojeSP, diaDaSemanaSP } from '../_shared/comum.ts';
import type { Parte } from '../_shared/gemini.ts';
import { type Evolution, numeroDoJid, LIMITE_MIDIA } from '../_shared/evolution.ts';
import { instrucoes } from './prompt.ts';
import * as R from './respostas.ts';
import { primeiroNome } from './respostas.ts';

/** Marca invisível no começo das mensagens do agente, para ele não ler a própria resposta. */
export const MARCA = '⁣';
const ROBO = '🤖 ';

export interface Conexao {
  user_id: string; workspace_id: string; profile: string; instancia: string; segredo: string;
  estado: string; phone: string | null; jids: string[];
}

export interface Deps {
  db: SupabaseClient;
  evo: Evolution;
  gerarJson: (o: { sistema: string; partes: Parte[]; esquema: unknown }) => Promise<{ dados: { lancamentos?: Extraido[]; resposta?: string | null }; modelo: string }>;
  agora?: () => Date;
  waitUntil: (p: Promise<unknown>) => void;
  log?: (...a: unknown[]) => void;
  espera?: (ms: number) => Promise<void>;
}

// deno-lint-ignore no-explicit-any
type Bruta = any;
interface Msg {
  id: string; tipo: 'text' | 'image' | 'audio' | 'document' | 'outro'; texto: string;
  mime: string; base64: string | null; bruta: Bruta;
}

const SAUDACAO = /^(ajuda|menu|help|oi+e?|ol[aá]|e a[ií]|bom dia|boa tarde|boa noite|\/start)[!?. ]*$/i;
const AGRADECIMENTO = /^(obrigad[oa]|obg|brigad[oa]|valeu|vlw|show|top|perfeito|beleza|blz|ok|certo|👍|🙏)[!. ]*$/iu;
const MIME_ACEITO = /^(image\/(jpeg|png|webp|heic|heif)|audio\/.+|application\/pdf)/i;
const IGNORAR = ['protocolMessage', 'reactionMessage', 'senderKeyDistributionMessage', 'pollUpdateMessage', 'editedMessage', 'keepInChatMessage'];

const SEGREDO_OK = (a: string, b: string) => {
  if (!a || !b || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
};

/** Converte a mensagem crua do WhatsApp no formato que o agente entende. */
export function lerMensagem(bruta: Bruta): Msg | null {
  const m = bruta?.message;
  const id = String(bruta?.key?.id || '');
  if (!m || !id) return null;
  if (IGNORAR.some(k => k in m)) return null;
  const doc = m.documentMessage ?? m.documentWithCaptionMessage?.message?.documentMessage;
  const base = { id, bruta, base64: typeof m.base64 === 'string' && m.base64 ? m.base64 : null };
  if (typeof m.conversation === 'string' || m.extendedTextMessage) {
    return { ...base, tipo: 'text', texto: String(m.conversation ?? m.extendedTextMessage?.text ?? '').trim(), mime: '' };
  }
  if (m.imageMessage) return { ...base, tipo: 'image', texto: String(m.imageMessage.caption || '').trim(), mime: String(m.imageMessage.mimetype || '') };
  if (m.audioMessage) return { ...base, tipo: 'audio', texto: '', mime: String(m.audioMessage.mimetype || '') };
  if (doc) return { ...base, tipo: 'document', texto: String(doc.caption || '').trim(), mime: String(doc.mimetype || '') };
  return { ...base, tipo: 'outro', texto: '', mime: '' };
}

/** Termina a conexão: grava o número, liga ao perfil e dá as boas-vindas na conversa "Você". */
export async function finalizarConexao(d: Pick<Deps, 'db' | 'evo' | 'log' | 'agora'>, cx: Conexao, phone: string): Promise<void> {
  const log = d.log ?? console.error;
  if (!/^[0-9]{8,15}$/.test(phone)) return;
  const jaEstava = cx.estado === 'conectado' && cx.phone === phone;
  const { error: e1 } = await d.db.from('whatsapp_conexoes')
    .update({ estado: 'conectado', phone, atualizado: (d.agora ?? (() => new Date()))().toISOString() })
    .eq('user_id', cx.user_id);
  if (e1) throw e1;
  // Um número só pode estar ligado a uma pessoa.
  await d.db.from('whatsapp_vinculos').delete().or(`phone.eq.${phone},user_id.eq.${cx.user_id}`);
  const { error: e2 } = await d.db.from('whatsapp_vinculos').insert({ phone, workspace_id: cx.workspace_id, user_id: cx.user_id, profile: cx.profile });
  if (e2) throw e2;
  cx.estado = 'conectado'; cx.phone = phone;
  if (jaEstava) return;
  const { data: membro } = await d.db.from('workspace_members').select('display_name,email').eq('user_id', cx.user_id).limit(1).maybeSingle();
  const nome = primeiroNome(membro?.display_name || membro?.email, PERFIS[cx.profile]?.curto ?? '');
  const id = await d.evo.enviarTexto(cx.instancia, phone, MARCA + ROBO + R.boasVindas(nome, cx.profile)).catch(e => { log('boas-vindas', e); return null; });
  if (id) await d.db.from('whatsapp_mensagens').insert({ message_id: id, phone, workspace_id: cx.workspace_id, status: 'agente' });
}

export function criarHandler(d: Deps) {
  const log = d.log ?? console.error;
  const agora = d.agora ?? (() => new Date());
  const espera = d.espera ?? (ms => new Promise(r => setTimeout(r, ms)));

  async function atualizarConexao(cx: Conexao, dados: Bruta) {
    const estado = String(dados?.state || '');
    if (estado === 'open') {
      const phone = numeroDoJid(dados?.wuid) || await d.evo.dono(cx.instancia) || '';
      await finalizarConexao(d, cx, phone);
    } else if (estado === 'close' && cx.estado !== 'desconectado') {
      await d.db.from('whatsapp_conexoes').update({ estado: cx.estado === 'conectado' ? 'desconectado' : 'aguardando', atualizado: agora().toISOString() }).eq('user_id', cx.user_id);
    }
  }

  async function ehDoAgente(id: string) {
    const { data } = await d.db.from('whatsapp_mensagens').select('status').eq('message_id', id).maybeSingle();
    return data?.status === 'agente';
  }

  async function processar(bruta: Bruta, cx: Conexao): Promise<void> {
    const key = bruta?.key;
    if (!key?.fromMe || !cx.phone) return; // só o que a própria pessoa escreveu
    const jid = String(key.remoteJid || '');
    if (!jid || /@g\.us$|@broadcast$|@newsletter$/.test(jid)) return;
    const msg = lerMensagem(bruta);
    if (!msg) return;

    // Eco da resposta do próprio agente: aprende o endereço da conversa "Você".
    if (msg.texto.startsWith(MARCA)) {
      if (!cx.jids.includes(jid) && (await ehDoAgente(msg.id) || (await espera(1500), await ehDoAgente(msg.id)))) {
        cx.jids = [...cx.jids, jid];
        await d.db.from('whatsapp_conexoes').update({ jids: cx.jids }).eq('user_id', cx.user_id);
      }
      return;
    }
    const conversaVoce = numeroDoJid(jid) === cx.phone || numeroDoJid(key.remoteJidAlt) === cx.phone || cx.jids.includes(jid);
    if (!conversaVoce) return; // conversa com outra pessoa: não é para o agente

    // Reenvio do aviso: a chave primária barra a segunda vez.
    const phone = cx.phone;
    const ins = await d.db.from('whatsapp_mensagens').insert({ message_id: msg.id, phone, workspace_id: cx.workspace_id });
    if (ins.error) { if (ins.error.code === '23505') return; throw ins.error; }
    const id = msg.id;
    const marcar = (status: string, extra: Record<string, unknown> = {}) =>
      d.db.from('whatsapp_mensagens').update({ status, ...extra }).eq('message_id', id);
    const desde = (horas: number) => new Date(agora().getTime() - horas * 3600_000).toISOString();

    // A resposta aparece ligada à mensagem da pessoa (sem repetir o arquivo).
    const citacao = { key: bruta.key, message: semBase64(bruta.message) };
    const responder = async (t: string, citar = true) => {
      const enviada = await d.evo.enviarTexto(cx.instancia, phone, MARCA + ROBO + t, citar ? citacao : undefined);
      if (enviada) await d.db.from('whatsapp_mensagens').insert({ message_id: enviada, phone, workspace_id: cx.workspace_id, status: 'agente' });
    };
    responderErro.set(id, responder);

    const { data: membro } = await d.db.from('workspace_members').select('display_name,email').eq('user_id', cx.user_id).limit(1).maybeSingle();
    const nome = primeiroNome(membro?.display_name || membro?.email, PERFIS[cx.profile]?.curto ?? '');
    nomes.set(id, nome);
    const texto = msg.texto;

    // ---------- Comandos ----------
    if (msg.tipo === 'text' && /^desfazer[!. ]*$/i.test(texto)) {
      const { data: ult } = await d.db.from('whatsapp_mensagens').select('message_id,entry_ids')
        .eq('phone', phone).eq('status', 'lancada').gte('created_at', desde(24))
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!ult) { await marcar('desfazer'); await responder(R.nadaParaDesfazer(nome)); return; }
      const { data: apagadas } = await d.db.from('entries').select('cat,val')
        .eq('workspace_id', cx.workspace_id).in('id', ult.entry_ids);
      const { error } = await d.db.from('entries').update({ deleted_at: agora().toISOString() })
        .eq('workspace_id', cx.workspace_id).in('id', ult.entry_ids);
      if (error) throw error;
      await d.db.from('whatsapp_mensagens').update({ status: 'desfeita' }).eq('message_id', ult.message_id);
      await marcar('desfazer');
      await responder(R.desfeito(nome, apagadas ?? []));
      return;
    }
    if (msg.tipo === 'text' && SAUDACAO.test(texto)) { await marcar('ajuda'); await responder(R.ajuda(nome, id), false); return; }
    if (msg.tipo === 'text' && AGRADECIMENTO.test(texto)) { await marcar('ajuda'); await responder(R.agradecimento(nome, id), false); return; }
    if (msg.tipo === 'text' && !texto) { await marcar('ignorada'); return; }

    // ---------- Leitura pelo Gemini ----------
    const partes: Parte[] = [];
    if (msg.tipo === 'image' || msg.tipo === 'audio' || msg.tipo === 'document') {
      // Ler mídia leva alguns segundos: avisa que recebeu, como uma pessoa faria.
      await responder(R.recebendo(nome, msg.tipo === 'audio' ? 'audio' : 'midia', id)).catch(e => log('aviso de recebimento', e));
      let base64 = msg.base64, mime = msg.mime;
      if (!base64) ({ base64, mime } = await d.evo.baixarMidia(cx.instancia, { key: bruta.key, message: semBase64(bruta.message) }).then(r => ({ base64: r.base64, mime: r.mime || mime })));
      const tipo = (mime || msg.mime || '').split(';')[0].trim();
      if (!MIME_ACEITO.test(tipo)) { await marcar('nao_suportado'); await responder(R.formatoNaoSuportado(nome)); return; }
      if (base64!.length * 0.75 > LIMITE_MIDIA) { await marcar('nao_suportado'); await responder(`Esse arquivo é grande demais pra mim, ${nome} 😅 Me manda uma foto ou um PDF menor?`); return; }
      partes.push({ inlineData: { mimeType: tipo, data: base64! } });
      partes.push({ text: msg.tipo === 'audio' ? 'Áudio enviado pela pessoa. Ouça e interprete.' : 'Comprovante enviado pela pessoa.' });
    } else if (msg.tipo !== 'text') {
      await marcar('nao_suportado');
      await responder(R.formatoNaoSuportado(nome));
      return;
    }
    if (texto) partes.push({ text: `Mensagem: ${texto}` });

    const hoje = hojeSP(agora());
    const { dados, modelo } = await d.gerarJson({ sistema: instrucoes(cx.profile, hoje, diaDaSemanaSP(agora()), nome), partes, esquema: esquemaExtracao() });
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
      ...l, workspace_id: cx.workspace_id, created_by: cx.user_id, origem: 'whatsapp'
    })));
    if (error) throw error;
    await marcar('lancada', { entry_ids: linhas.map(l => l.id) });
    log(`lançado via ${modelo}: ${linhas.length} linha(s)`);
    const contexto = grupos.length === 1 ? await contextoDoMes(cx.workspace_id, grupos[0][0]).catch(() => null) : null;
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

  // Para a mensagem de erro também sair pessoal e na conversa certa.
  const nomes = new Map<string, string>();
  const responderErro = new Map<string, (t: string) => Promise<void>>();

  async function processarSeguro(bruta: Bruta, cx: Conexao) {
    const id = String(bruta?.key?.id);
    try { await processar(bruta, cx); } catch (e) {
      log('erro ao processar mensagem', id, e);
      try {
        await d.db.from('whatsapp_mensagens').update({ status: 'erro' }).eq('message_id', id);
        const r = responderErro.get(id);
        if (r) await r(R.falhaTemporaria(nomes.get(id) ?? ''));
      } catch { /* sem como avisar */ }
    } finally { nomes.delete(id); responderErro.delete(id); }
  }

  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return new Response('método não permitido', { status: 405 });
    const url = new URL(req.url);
    const instancia = url.searchParams.get('i') || '', segredo = url.searchParams.get('t') || '';
    if (!/^[a-z0-9-]{8,64}$/.test(instancia)) return new Response('não autorizado', { status: 401 });
    const { data: cx, error } = await d.db.from('whatsapp_conexoes')
      .select('user_id,workspace_id,profile,instancia,segredo,estado,phone,jids').eq('instancia', instancia).maybeSingle();
    if (error) return new Response('erro', { status: 500 });
    if (!cx || !SEGREDO_OK(segredo, cx.segredo)) return new Response('não autorizado', { status: 401 });

    let corpo: Bruta;
    try { corpo = await req.json(); } catch { return new Response('json inválido', { status: 400 }); }
    const evento = String(corpo?.event || '').toLowerCase().replace(/_/g, '.');
    const conexao = { ...cx, jids: cx.jids ?? [] } as Conexao;

    if (evento === 'connection.update') {
      d.waitUntil(atualizarConexao(conexao, corpo.data).catch(e => log('conexão', e)));
    } else if (evento === 'messages.upsert') {
      const lista = Array.isArray(corpo.data) ? corpo.data : [corpo.data];
      d.waitUntil((async () => { for (const m of lista) await processarSeguro(m, conexao); })());
    }
    return new Response('ok', { status: 200 });
  };
}

/** Tira o arquivo em base64 da mensagem antes de citá-la ou pedir o download. */
// deno-lint-ignore no-explicit-any
function semBase64(m: any) {
  if (!m || typeof m !== 'object' || !('base64' in m)) return m;
  const { base64: _b, ...resto } = m;
  return resto;
}
