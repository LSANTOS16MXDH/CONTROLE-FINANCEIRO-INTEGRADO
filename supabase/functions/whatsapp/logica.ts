// Agente de lançamentos pelo WhatsApp: recebe o aviso da Meta, responde 200 na
// hora e processa cada mensagem em segundo plano.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import { encodeBase64 } from 'jsr:@std/encoding@1.0.10/base64';
import { esquemaExtracao, montarLinhas, descrever, PERFIS, type Extraido, type Linha } from '../_shared/lancamento.ts';
import { hojeSP, diaDaSemanaSP } from '../_shared/comum.ts';
import type { Parte } from '../_shared/gemini.ts';
import { instrucoes, AJUDA } from './prompt.ts';
import { assinaturaValida } from './meta.ts';

export interface Deps {
  db: SupabaseClient;
  appSecret: string;
  verifyToken: string;
  phoneNumberId?: string;
  gerarJson: (o: { sistema: string; partes: Parte[]; esquema: unknown }) => Promise<{ dados: { lancamentos?: Extraido[]; resposta?: string | null }; modelo: string }>;
  baixarMidia: (id: string) => Promise<{ bytes: Uint8Array; mime: string }>;
  enviarTexto: (phoneNumberId: string, para: string, texto: string) => Promise<void>;
  agora?: () => Date;
  waitUntil: (p: Promise<unknown>) => void;
  log?: (...a: unknown[]) => void;
}

// deno-lint-ignore no-explicit-any
type Msg = any;

const CODIGO = /^(?:vincular\s+)?([0-9a-f]{8})$/i;
const SAUDACAO = /^(ajuda|menu|help|oi|ol[aá]|bom dia|boa tarde|boa noite|\/start)[!. ]*$/i;
const MIME_ACEITO = /^(image\/(jpeg|png|webp|heic|heif)|audio\/.+|application\/pdf)/i;

export function criarHandler(d: Deps) {
  const log = d.log ?? console.error;
  const agora = d.agora ?? (() => new Date());

  async function processar(msg: Msg, phoneNumberId: string): Promise<void> {
    const phone = String(msg.from || ''), id = String(msg.id || '');
    if (!/^[0-9]{8,15}$/.test(phone) || !id || msg.type === 'reaction') return;
    const responder = (t: string) => d.enviarTexto(phoneNumberId, phone, t);

    // Reenvio da Meta: a chave primária barra a segunda vez.
    const ins = await d.db.from('whatsapp_mensagens').insert({ message_id: id, phone });
    if (ins.error) { if (ins.error.code === '23505') return; throw ins.error; }
    const marcar = (status: string, extra: Record<string, unknown> = {}) =>
      d.db.from('whatsapp_mensagens').update({ status, ...extra }).eq('message_id', id);
    const desde = (horas: number) => new Date(agora().getTime() - horas * 3600_000).toISOString();
    const contar = async (status: string, horas: number) => {
      const { count } = await d.db.from('whatsapp_mensagens').select('message_id', { count: 'exact', head: true })
        .eq('phone', phone).eq('status', status).gte('created_at', desde(horas));
      return count ?? 0;
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
        await responder('Código inválido ou expirado. Gere um novo no site, em *Agentes › WhatsApp*.');
        return;
      }
      await d.db.from('whatsapp_vinculos').delete().or(`phone.eq.${phone},user_id.eq.${c.user_id}`);
      const { error } = await d.db.from('whatsapp_vinculos').insert({ phone, workspace_id: c.workspace_id, user_id: c.user_id, profile: c.profile });
      if (error) throw error;
      await d.db.from('whatsapp_codigos').delete().eq('codigo', cod[1].toUpperCase());
      await marcar('vinculado', { workspace_id: c.workspace_id });
      await responder(`✅ Número vinculado ao perfil *${PERFIS[c.profile]?.nome ?? c.profile}*.\n\n${AJUDA}`);
      return;
    }
    if (!vinc) {
      const jaAvisado = await contar('nao_vinculado', 6);
      await marcar('nao_vinculado');
      if (!jaAvisado) await responder('Este número ainda não está vinculado. No site, abra *Agentes › WhatsApp*, gere um código e envie aqui.');
      return;
    }
    await marcar('recebida', { workspace_id: vinc.workspace_id });

    // ---------- Comandos ----------
    if (msg.type === 'text' && /^desfazer[!. ]*$/i.test(texto)) {
      const { data: ult } = await d.db.from('whatsapp_mensagens').select('message_id,entry_ids')
        .eq('phone', phone).eq('status', 'lancada').gte('created_at', desde(24))
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!ult) { await marcar('desfazer'); await responder('Não há lançamento das últimas 24 horas para desfazer.'); return; }
      const { error } = await d.db.from('entries').update({ deleted_at: agora().toISOString() })
        .eq('workspace_id', vinc.workspace_id).in('id', ult.entry_ids);
      if (error) throw error;
      await d.db.from('whatsapp_mensagens').update({ status: 'desfeita' }).eq('message_id', ult.message_id);
      await marcar('desfazer');
      await responder(`↩️ Desfeito: ${ult.entry_ids.length} lançamento(s) apagado(s).`);
      return;
    }
    if (msg.type === 'text' && SAUDACAO.test(texto)) { await marcar('ajuda'); await responder(AJUDA); return; }

    // ---------- Leitura pelo Gemini ----------
    const partes: Parte[] = [];
    const midia = msg.image || msg.audio || msg.document;
    if (midia) {
      const { bytes, mime } = await d.baixarMidia(midia.id);
      const tipo = (mime || midia.mime_type || '').split(';')[0].trim();
      if (!MIME_ACEITO.test(tipo)) { await marcar('nao_suportado'); await responder('Consigo ler fotos, PDFs, áudios e mensagens de texto. Esse formato eu ainda não leio.'); return; }
      partes.push({ inlineData: { mimeType: tipo, data: encodeBase64(bytes) } });
      partes.push({ text: msg.audio ? 'Áudio enviado pela pessoa. Ouça e interprete.' : 'Comprovante enviado pela pessoa.' });
    } else if (msg.type !== 'text') {
      await marcar('nao_suportado');
      await responder('Consigo ler fotos, PDFs, áudios e mensagens de texto.');
      return;
    }
    if (texto) partes.push({ text: `Mensagem: ${texto}` });

    const hoje = hojeSP(agora());
    const { dados, modelo } = await d.gerarJson({ sistema: instrucoes(vinc.profile, hoje, diaDaSemanaSP(agora())), partes, esquema: esquemaExtracao() });
    const extraidos = Array.isArray(dados.lancamentos) ? dados.lancamentos.slice(0, 5) : [];
    if (!extraidos.length) {
      await marcar('sem_lancamento');
      await responder(dados.resposta || 'Não encontrei um gasto ou recebimento. Pode me dizer o valor e a forma de pagamento?');
      return;
    }

    const grupos: Linha[][] = [], problemas: string[] = [];
    for (const e of extraidos) {
      try { grupos.push(montarLinhas(e, hoje)); } catch (err) { problemas.push((err as Error).message); }
    }
    if (!grupos.length) {
      await marcar('sem_lancamento');
      await responder(`${problemas[0]} Pode me mandar de novo com o valor, a forma de pagamento e do que se trata?`);
      return;
    }
    const linhas = grupos.flat();
    const { error } = await d.db.from('entries').insert(linhas.map(l => ({
      ...l, workspace_id: vinc.workspace_id, created_by: vinc.user_id, origem: 'whatsapp'
    })));
    if (error) throw error;
    await marcar('lancada', { entry_ids: linhas.map(l => l.id) });
    log(`lançado via ${modelo}: ${linhas.length} linha(s)`);
    await responder(`✅ Lançado:\n\n${grupos.map(descrever).join('\n\n')}${problemas.length ? `\n\n⚠️ ${problemas.length} item(ns) não lançado(s): ${problemas.join(' ')}` : ''}\n\nResponda *desfazer* para apagar.`);
  }

  async function processarSeguro(msg: Msg, phoneNumberId: string) {
    try { await processar(msg, phoneNumberId); } catch (e) {
      log('erro ao processar mensagem', msg?.id, e);
      try {
        await d.db.from('whatsapp_mensagens').update({ status: 'erro' }).eq('message_id', String(msg?.id));
        await d.enviarTexto(phoneNumberId, String(msg.from), 'Não consegui registrar agora. Tente de novo em alguns minutos.');
      } catch { /* sem como avisar */ }
    }
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
