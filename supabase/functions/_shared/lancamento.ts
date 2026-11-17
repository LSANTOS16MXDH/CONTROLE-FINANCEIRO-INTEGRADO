// Transforma o que o Gemini leu de uma mensagem em linhas da tabela entries,
// com as mesmas regras do formulário do site (assets/data.js -> adicionar).
// Os perfis são do CFI de quem mandou a mensagem (carregarPerfis).
import type { Kind, Perfis } from './perfis.ts';
export { TIPOS, type Perfis } from './perfis.ts';

/** Lançamento como o modelo devolve. "conta" é "perfil|in|CATEGORIA" ou "perfil|out|CATEGORIA". */
export interface Extraido {
  conta: string;
  descricao: string;
  valor_parcela: number;
  parcelas: number;
  forma: string;
  cartao: string;
  recorrente: boolean;
  data: string;
  pago: boolean;
}

export interface Linha {
  id: string; profile: string; kind: Kind; cat: string; obs: string; val: number;
  forma: string; tipo: string; card: string; parc: string; venc: string; pag: string | null;
}

/** Todas as combinações válidas de perfil, tipo e categoria. */
export function contas(perfis: Perfis): string[] {
  const lista: string[] = [];
  for (const [id, p] of Object.entries(perfis)) {
    for (const k of ['in', 'out'] as Kind[]) p[k].categorias.forEach(c => lista.push(`${id}|${k}|${c.nome}`));
  }
  return lista;
}

const todasFormas = (perfis: Perfis) => [...new Set(Object.values(perfis).flatMap(p => [...p.in.formas, ...p.out.formas]))];
const todosCartoes = (perfis: Perfis) => [...new Set(Object.values(perfis).flatMap(p => p.out.cartoes))];

/** Esquema da resposta do modelo: as listas fechadas impedem categorias inventadas. */
export function esquemaExtracao(perfis: Perfis) {
  return {
    type: 'object',
    properties: {
      lancamentos: {
        type: 'array', maxItems: 5,
        items: {
          type: 'object',
          properties: {
            conta: { type: 'string', enum: contas(perfis), description: 'perfil|in|CATEGORIA para entrada, perfil|out|CATEGORIA para saída' },
            descricao: { type: 'string', description: 'Estabelecimento ou descrição curta, até 60 caracteres' },
            valor_parcela: { type: 'number', description: 'Valor de cada parcela em reais; sem parcelamento, o valor total' },
            parcelas: { type: 'integer', minimum: 1, maximum: 48 },
            forma: { type: 'string', enum: todasFormas(perfis) },
            cartao: { type: 'string', enum: todosCartoes(perfis), description: "Cartão ou conta usada; '-' se não informado" },
            recorrente: { type: 'boolean', description: 'Conta que se repete todo mês (assinatura, aluguel, plano)' },
            data: { type: 'string', format: 'date', description: 'Data da compra, do recebimento ou do vencimento (AAAA-MM-DD)' },
            pago: { type: 'boolean', description: 'true se já foi pago ou recebido; false se ainda vai vencer' }
          },
          required: ['conta', 'descricao', 'valor_parcela', 'parcelas', 'forma', 'cartao', 'recorrente', 'data', 'pago']
        }
      },
      resposta: { type: ['string', 'null'], description: 'Só quando não houver lançamento: pergunta curta pedindo o que falta' }
    },
    required: ['lancamentos', 'resposta']
  };
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

function escolherCartao(lista: string[], pedido: string, forma: string): string {
  if (!lista.length) return '-';
  const alvo = semAcento(pedido || '-');
  const exato = lista.find(c => semAcento(c) === alvo);
  let card = exato ?? (alvo !== '-' ? lista.find(c => c !== '-' && (semAcento(c).includes(alvo) || alvo.includes(semAcento(c)))) : undefined) ?? '-';
  // Crédito sempre tem cartão, como no site; sem cartão informado, usa o primeiro.
  if (forma.startsWith('Crédito') && card === '-') card = lista.find(c => c !== '-') ?? '-';
  return card;
}

const dataValida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));

/** Valida e expande parcelas. Lança Error com mensagem para o usuário se algo não fecha. */
export function montarLinhas(e: Extraido, hoje: string, perfis: Perfis, novoId: () => string = () => crypto.randomUUID()): Linha[] {
  const [perfil, kind, ...resto] = (e.conta || '').split('|');
  const cat = resto.join('|');
  const p = perfis[perfil];
  if (!p || (kind !== 'in' && kind !== 'out') || !p[kind].categorias.some(c => c.nome === cat)) {
    throw new Error('Não identifiquei a categoria do lançamento.');
  }
  const op = p[kind];
  const val = Math.round(Number(e.valor_parcela) * 100) / 100;
  if (!(val > 0) || val > 100_000_000) throw new Error('Não identifiquei o valor.');
  const n = Math.min(48, Math.max(1, Math.round(Number(e.parcelas) || 1)));
  const forma = op.formas.includes(e.forma) ? e.forma : op.formas[0];
  const card = kind === 'out' ? escolherCartao(op.cartoes, e.cartao, forma) : '-';
  const tipo = n > 1 ? 'Parcelado' : e.recorrente ? 'Recorrente' : 'Único';
  const base = dataValida(e.data) ? e.data : hoje;
  const pag = e.pago ? base : null;
  const obs = String(e.descricao || '').replace(/\s+/g, ' ').trim().slice(0, 80);

  const [y0, m0, d0] = base.split('-').map(Number);
  const linhas: Linha[] = [];
  for (let i = 0; i < n; i++) {
    const total = (m0 - 1) + i, y = y0 + Math.floor(total / 12), m = total % 12;
    const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // 31/01 + 1 mês cai em 28/02
    const venc = `${y}-${String(m + 1).padStart(2, '0')}-${String(Math.min(d0, ultimo)).padStart(2, '0')}`;
    linhas.push({ id: novoId(), profile: perfil, kind, cat, obs, val, forma, tipo, card, parc: `${i + 1}/${n}`, venc, pag: i === 0 ? pag : null });
  }
  return linhas;
}

export const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dataBR = (iso: string) => iso.split('-').reverse().join('/');

/** Resumo de um lançamento para a resposta no WhatsApp. */
export function descrever(linhas: Linha[], perfis: Perfis): string {
  const r = linhas[0], p = perfis[r.profile];
  const onde = `${p?.curto ?? r.profile} › ${r.kind === 'in' ? 'Entrada' : 'Saída'}`;
  const parc = linhas.length > 1 ? ` em ${linhas.length}x de ${brl(r.val)} (total ${brl(r.val * linhas.length)})` : ` ${brl(r.val)}`;
  const meio = [r.forma, r.card !== '-' ? r.card : ''].filter(Boolean).join(' ');
  const situacao = r.pag ? `pago em ${dataBR(r.pag)}` : `vence em ${dataBR(r.venc)}`;
  return `*${r.cat}*${r.obs ? ` (${r.obs})` : ''}:${parc}\n${onde} · ${meio} · ${r.tipo === 'Recorrente' ? 'recorrente · ' : ''}${situacao}`;
}
