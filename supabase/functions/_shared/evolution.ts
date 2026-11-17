// Cliente da Evolution API (v2.3.7), o servidor que mantém cada WhatsApp
// conectado como aparelho. Endereço e chave ficam nos segredos do Supabase:
// EVOLUTION_URL e EVOLUTION_API_KEY.

export interface QR { base64: string | null; codigo: string | null }
export type EstadoEvo = 'open' | 'connecting' | 'close' | 'inexistente';

export interface Evolution {
  criar(instancia: string, webhookUrl: string, numero?: string): Promise<QR>;
  qr(instancia: string, numero?: string): Promise<QR>;
  estado(instancia: string): Promise<EstadoEvo>;
  dono(instancia: string): Promise<string | null>;
  apagar(instancia: string): Promise<void>;
  enviarTexto(instancia: string, numero: string, texto: string, citar?: { key: unknown; message: unknown }): Promise<string | null>;
  baixarMidia(instancia: string, msg: { key: unknown; message: unknown }): Promise<{ base64: string; mime: string }>;
}

export const LIMITE_MIDIA = 15 * 1024 * 1024;

/** Só os dígitos do número de um endereço do WhatsApp (5531...@s.whatsapp.net). */
export const numeroDoJid = (jid: unknown) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');

function qrDe(d: any): QR {
  const q = d?.qrcode ?? d ?? {};
  return { base64: typeof q.base64 === 'string' && q.base64 ? q.base64 : null, codigo: typeof q.pairingCode === 'string' && q.pairingCode ? q.pairingCode : null };
}

export function evolutionReal(): Evolution {
  const base = (Deno.env.get('EVOLUTION_URL') || '').replace(/\/+$/, '');
  const chave = Deno.env.get('EVOLUTION_API_KEY') || '';
  const nome = encodeURIComponent;

  async function chamar(metodo: string, caminho: string, corpo?: unknown, prazo = 25000) {
    if (!base || !chave) throw new Error('evolution_nao_configurada');
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: { apikey: chave, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(prazo)
    });
    const texto = await r.text();
    let dados: any = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch { dados = texto; }
    return { ok: r.ok, status: r.status, dados };
  }

  return {
    async criar(instancia, webhookUrl, numero) {
      const r = await chamar('POST', '/instance/create', {
        instanceName: instancia,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        ...(numero ? { number: numero } : {}),
        // Só o essencial: sem histórico, sem grupos, e o celular continua avisando as mensagens.
        rejectCall: false, groupsIgnore: true, alwaysOnline: false, readMessages: false, readStatus: false, syncFullHistory: false,
        webhook: { enabled: true, url: webhookUrl, byEvents: false, base64: true, events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'] }
      }, 40000);
      if (!r.ok) throw new Error(`criar ${r.status}: ${JSON.stringify(r.dados).slice(0, 300)}`);
      return qrDe(r.dados);
    },
    async qr(instancia, numero) {
      const r = await chamar('GET', `/instance/connect/${nome(instancia)}${numero ? `?number=${numero}` : ''}`);
      if (!r.ok) throw new Error(`qr ${r.status}`);
      return qrDe(r.dados);
    },
    async estado(instancia) {
      const r = await chamar('GET', `/instance/connectionState/${nome(instancia)}`);
      if (r.status === 404) return 'inexistente';
      if (!r.ok) throw new Error(`estado ${r.status}`);
      const s = r.dados?.instance?.state ?? r.dados?.state;
      return s === 'open' || s === 'connecting' ? s : 'close';
    },
    async dono(instancia) {
      const r = await chamar('GET', `/instance/fetchInstances?instanceName=${nome(instancia)}`);
      if (!r.ok) return null;
      const lista = Array.isArray(r.dados) ? r.dados : [r.dados];
      const i = lista.find((x: any) => (x?.name ?? x?.instance?.instanceName) === instancia) ?? lista[0];
      const jid = i?.ownerJid ?? i?.instance?.owner ?? i?.owner;
      return numeroDoJid(jid) || null;
    },
    async apagar(instancia) {
      const r = await chamar('DELETE', `/instance/delete/${nome(instancia)}`);
      if (!r.ok && r.status !== 404) throw new Error(`apagar ${r.status}`);
    },
    async enviarTexto(instancia, numero, texto, citar) {
      const r = await chamar('POST', `/message/sendText/${nome(instancia)}`, {
        number: numero, text: texto.slice(0, 4000), delay: 1200, linkPreview: false,
        ...(citar ? { quoted: citar } : {})
      });
      if (!r.ok) throw new Error(`envio ${r.status}: ${JSON.stringify(r.dados).slice(0, 300)}`);
      return r.dados?.key?.id ?? null;
    },
    async baixarMidia(instancia, msg) {
      const r = await chamar('POST', `/chat/getBase64FromMediaMessage/${nome(instancia)}`, { message: msg, convertToMp4: false }, 40000);
      if (!r.ok || !r.dados?.base64) throw new Error(`mídia ${r.status}`);
      return { base64: String(r.dados.base64).replace(/^data:[^,]*,/, ''), mime: String(r.dados.mimetype || '') };
    }
  };
}
