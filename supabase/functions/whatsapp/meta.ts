// API oficial do WhatsApp (Meta Cloud API).
const GRAPH = `https://graph.facebook.com/${Deno.env.get('META_GRAPH_VERSION') || 'v27.0'}`;
const LIMITE_MIDIA = 15 * 1024 * 1024; // o Gemini aceita até 20 MB por pedido, somando tudo

function token(): string {
  const t = Deno.env.get('META_ACCESS_TOKEN');
  if (!t) throw new Error('META_ACCESS_TOKEN não configurado');
  return t;
}

/** Baixa uma foto, áudio ou documento enviado na conversa. */
export async function baixarMidia(mediaId: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const auth = { Authorization: `Bearer ${token()}` };
  const info = await fetch(`${GRAPH}/${encodeURIComponent(mediaId)}`, { headers: auth, signal: AbortSignal.timeout(20000) });
  if (!info.ok) throw new Error(`mídia ${info.status}`);
  const { url, mime_type, file_size } = await info.json();
  if (Number(file_size) > LIMITE_MIDIA) throw new Error('arquivo grande demais');
  const arq = await fetch(url, { headers: auth, signal: AbortSignal.timeout(30000) });
  if (!arq.ok) throw new Error(`download ${arq.status}`);
  const bytes = new Uint8Array(await arq.arrayBuffer());
  if (bytes.length > LIMITE_MIDIA) throw new Error('arquivo grande demais');
  return { bytes, mime: String(mime_type || arq.headers.get('content-type') || '') };
}

/**
 * A Meta manda celulares do Brasil sem o nono dígito (55 + DDD + 8 dígitos),
 * mas a lista de destinatários e o envio esperam o número com o 9.
 */
export function numeroDeEnvio(para: string): string {
  const m = para.match(/^55(\d{2})([6-9]\d{7})$/);
  return m ? `55${m[1]}9${m[2]}` : para;
}

/** Envia texto. Com "citar", a resposta aparece ligada à mensagem da pessoa. */
export async function enviarTexto(phoneNumberId: string, para: string, texto: string, citar?: string): Promise<void> {
  const corpo: Record<string, unknown> = {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: numeroDeEnvio(para),
    type: 'text', text: { preview_url: false, body: texto.slice(0, 4000) }
  };
  if (citar) corpo.context = { message_id: citar };
  const r = await fetch(`${GRAPH}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(20000)
  });
  if (!r.ok) throw new Error(`envio ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

/**
 * Marca a mensagem como lida (os dois tiques azuis) e mostra "digitando…"
 * até a resposta sair ou por até 25 segundos.
 */
export async function marcarLido(phoneNumberId: string, messageId: string): Promise<void> {
  await fetch(`${GRAPH}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId, typing_indicator: { type: 'text' } }),
    signal: AbortSignal.timeout(10000)
  });
}

/** Confere o cabeçalho X-Hub-Signature-256: HMAC-SHA256 do corpo com o App Secret. */
export async function assinaturaValida(corpo: string, cabecalho: string | null, segredo: string): Promise<boolean> {
  if (!segredo || !cabecalho?.startsWith('sha256=')) return false;
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo)));
  const esperado = Array.from(mac, b => b.toString(16).padStart(2, '0')).join('');
  const recebido = cabecalho.slice(7).toLowerCase();
  if (recebido.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return dif === 0;
}
