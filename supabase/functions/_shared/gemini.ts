// Chamadas ao Gemini (Google AI Studio) pela API REST generateContent.
// Tenta o modelo principal e, se ele estiver sobrecarregado ou sem cota, o reserva.

const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

export const MODELOS = [
  Deno.env.get('GEMINI_MODELO') || 'gemini-3.8-flash',
  Deno.env.get('GEMINI_MODELO_RESERVA') || 'gemini-3.5-flash-lite'
];

// deno-lint-ignore no-explicit-any
export type Json = any;
export type Parte = Record<string, Json>;
export interface Conteudo { role: 'user' | 'model'; parts: Parte[] }

export class ErroGemini extends Error {
  constructor(msg: string, readonly status: number, readonly trocarModelo: boolean) { super(msg); }
}

function chave(): string {
  const k = Deno.env.get('GEMINI_API_KEY');
  if (!k) throw new ErroGemini('GEMINI_API_KEY não configurada', 0, false);
  return k;
}

async function chamar(modelo: string, corpo: Json, timeoutMs: number): Promise<Json> {
  let r: Response;
  try {
    r = await fetch(URL_BASE + modelo + ':generateContent', {
      method: 'POST',
      headers: { 'x-goog-api-key': chave(), 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (e) {
    throw new ErroGemini('falha de rede: ' + (e as Error).message, 0, true);
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = d?.error?.message || r.statusText;
    // 429 = cota, 5xx = sobrecarga: vale tentar o outro modelo.
    throw new ErroGemini(`${r.status} ${msg}`, r.status, r.status === 429 || r.status >= 500);
  }
  const cand = d.candidates?.[0];
  if (!cand?.content?.parts) {
    const motivo = d.promptFeedback?.blockReason || cand?.finishReason || 'resposta vazia';
    throw new ErroGemini('sem resposta: ' + motivo, 200, false);
  }
  return d;
}

const espera = (ms: number) => new Promise(ok => setTimeout(ok, ms));

/** Alterna entre os modelos quando o Gemini está sobrecarregado (503) ou sem cota (429),
    esperando um pouco antes da segunda rodada, sem passar do prazo total. */
async function comTentativas<T>(prazoMs: number, tentar: (modelo: string, restanteMs: number) => Promise<T>): Promise<T> {
  const fim = Date.now() + prazoMs;
  const plano: [string, number][] = [[MODELOS[0], 0], [MODELOS[1], 0], [MODELOS[0], 2000], [MODELOS[1], 4000]];
  let ultimo: unknown;
  for (const [modelo, pausa] of plano) {
    if (Date.now() + pausa + 5000 > fim) break;
    if (pausa) await espera(pausa);
    try { return await tentar(modelo, fim - Date.now()); } catch (e) {
      ultimo = e;
      if (!(e instanceof ErroGemini && e.trocarModelo)) throw e;
    }
  }
  throw ultimo ?? new ErroGemini('prazo esgotado', 0, false);
}

/** Uma chamada que devolve JSON no formato do esquema. */
export function gerarJson(opts: {
  sistema: string; partes: Parte[]; esquema: Json; prazoMs?: number;
}): Promise<{ dados: Json; modelo: string }> {
  return comTentativas(opts.prazoMs ?? 120000, async (modelo, restante) => {
    const d = await chamar(modelo, {
      systemInstruction: { parts: [{ text: opts.sistema }] },
      contents: [{ role: 'user', parts: opts.partes }],
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: opts.esquema }
    }, Math.min(70000, restante));
    const texto = d.candidates[0].content.parts.map((p: Parte) => p.text || '').join('');
    return { dados: JSON.parse(texto), modelo };
  });
}

/** Conversa com ferramentas: repete até o modelo responder em texto. */
export async function conversar(opts: {
  sistema: string;
  historico: Conteudo[];
  ferramentas: { name: string; description: string; parametersJsonSchema: Json }[];
  executar: (nome: string, args: Json) => Promise<Json>;
  maxPassos?: number;
  prazoMs?: number;
}): Promise<{ texto: string; modelo: string; passos: number }> {
  return comTentativas(opts.prazoMs ?? 110000, async (modelo, restante) => {
    // As assinaturas de raciocínio valem só para o modelo que as gerou: ao trocar
    // de modelo, a conversa recomeça do histórico original.
    const fim = Date.now() + restante;
    const conteudos: Conteudo[] = opts.historico.map(c => ({ role: c.role, parts: [...c.parts] }));
    for (let passo = 1; passo <= (opts.maxPassos ?? 5); passo++) {
        if (fim - Date.now() < 5000) throw new ErroGemini('prazo esgotado', 0, false);
        const d = await chamar(modelo, {
          systemInstruction: { parts: [{ text: opts.sistema }] },
          contents: conteudos,
          tools: [{ functionDeclarations: opts.ferramentas }]
        }, fim - Date.now());
        const resposta: Conteudo = d.candidates[0].content;
        const chamadas = resposta.parts.filter(p => p.functionCall).map(p => p.functionCall);
        if (!chamadas.length) {
          const texto = resposta.parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim();
          if (!texto) throw new ErroGemini('resposta sem texto', 200, true);
          return { texto, modelo, passos: passo };
        }
        conteudos.push({ role: 'model', parts: resposta.parts }); // devolvido sem mudanças
        const resultados: Parte[] = [];
        for (const c of chamadas) {
          let saida: Json;
          try { saida = await opts.executar(c.name, c.args || {}); } catch (e) { saida = { erro: (e as Error).message }; }
          resultados.push({ functionResponse: { name: c.name, id: c.id, response: { resultado: saida } } });
        }
        conteudos.push({ role: 'user', parts: resultados });
    }
    throw new ErroGemini('limite de passos atingido', 200, false);
  });
}
