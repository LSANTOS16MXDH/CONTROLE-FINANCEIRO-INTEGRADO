// Visão financeira para o CFO: resumo compacto e ferramentas de consulta.
import { PERFIS } from './lancamento.ts';

export interface Lanc {
  id?: string; profile: string; kind: 'in' | 'out'; cat: string; obs: string; val: number | string;
  forma: string; tipo: string; card: string; parc: string; venc: string; pag: string | null; origem?: string;
}
export interface Alvo { scope: string; key: string; value: number | string }

const r2 = (v: number) => Math.round(v * 100) / 100;
const mes = (iso: string) => iso.slice(0, 7);
const somaVal = (l: Lanc[]) => r2(l.reduce((s, x) => s + Number(x.val), 0));

function mesesEntre(inicio: string, fim: string): string[] {
  const out: string[] = [];
  let [y, m] = inicio.split('-').map(Number);
  const [yf, mf] = fim.split('-').map(Number);
  while (y < yf || (y === yf && m <= mf)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
function somarMeses(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const t = (m - 1) + n;
  return `${y + Math.floor(t / 12)}-${String(((t % 12) + 12) % 12 + 1).padStart(2, '0')}`;
}

/** Resumo em JSON compacto: 12 meses para trás e 3 para frente, por perfil. */
export function resumir(linhas: Lanc[], alvos: Alvo[], hoje: string) {
  const atual = mes(hoje);
  const meses = mesesEntre(somarMeses(atual, -11), somarMeses(atual, 3));
  const perfis: Record<string, unknown> = {};

  for (const [id, p] of Object.entries(PERFIS)) {
    const doPerfil = linhas.filter(l => l.profile === id);
    if (!doPerfil.length) { perfis[id] = { nome: p.nome, sem_lancamentos: true }; continue; }
    const porMes = meses.map(m => {
      const noMes = doPerfil.filter(l => mes(l.venc) === m);
      const k = (kind: string, pago: boolean) => somaVal(noMes.filter(l => l.kind === kind && !!l.pag === pago));
      return { mes: m, recebido: k('in', true), a_receber: k('in', false), gasto: k('out', true), a_pagar: k('out', false) };
    }).filter(x => x.recebido + x.a_receber + x.gasto + x.a_pagar > 0);

    const tres = [somarMeses(atual, -2), somarMeses(atual, -1), atual];
    const categorias = (kind: string) => {
      const mapa: Record<string, number> = {};
      doPerfil.filter(l => l.kind === kind && tres.includes(mes(l.venc))).forEach(l => { mapa[l.cat] = (mapa[l.cat] || 0) + Number(l.val); });
      return Object.entries(mapa).map(([cat, total]) => ({ cat, total: r2(total) })).sort((a, b) => b.total - a.total);
    };
    const cartoes: Record<string, Record<string, number>> = {};
    doPerfil.filter(l => l.kind === 'out' && l.forma.startsWith('Crédito') && l.card !== '-' && mes(l.venc) >= atual && mes(l.venc) <= somarMeses(atual, 2))
      .forEach(l => { const c = (cartoes[l.card] ||= {}); c[mes(l.venc)] = r2((c[mes(l.venc)] || 0) + Number(l.val)); });

    perfis[id] = {
      nome: p.nome,
      por_mes: porMes,
      categorias_ultimos_3_meses: { entradas: categorias('in'), saidas: categorias('out') },
      faturas_credito_proximos_meses: cartoes,
      atrasados: doPerfil.filter(l => !l.pag && l.venc < hoje).sort((a, b) => a.venc.localeCompare(b.venc)).slice(0, 15)
        .map(l => ({ cat: l.cat, obs: l.obs, val: Number(l.val), kind: l.kind, venc: l.venc })),
      parcelados_ativos: doPerfil.filter(l => l.tipo === 'Parcelado' && !l.pag && l.venc >= hoje).length,
      recorrentes: [...new Set(doPerfil.filter(l => l.tipo === 'Recorrente').map(l => `${l.kind === 'in' ? '+' : '-'} ${l.cat}${l.obs ? ' (' + l.obs + ')' : ''}`))].slice(0, 20)
    };
  }

  const metas = alvos.filter(a => Number(a.value) > 0).map(a => ({ tipo: a.scope, chave: a.key, valor: Number(a.value) }));
  return { hoje, mes_atual: atual, total_lancamentos: linhas.length, perfis, metas_e_limites: metas };
}

// ---------- Ferramentas ----------

const perfisValidos = () => Object.keys(PERFIS);

export const FERRAMENTAS = [
  {
    name: 'consultar_lancamentos',
    description: 'Lista lançamentos com filtros, mais recentes primeiro, com a soma dos valores. Use para detalhar um gasto, uma categoria, um período ou contas pendentes.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        perfil: { type: 'string', enum: perfisValidos(), description: 'Sem perfil = todos' },
        tipo: { type: 'string', enum: ['in', 'out'], description: 'in = entradas, out = saídas' },
        categoria: { type: 'string', description: 'Nome exato da categoria' },
        busca: { type: 'string', description: 'Trecho da observação, por exemplo o nome de uma loja' },
        de: { type: 'string', format: 'date', description: 'Data do lançamento (compra, recebimento ou vencimento) a partir de AAAA-MM-DD' },
        ate: { type: 'string', format: 'date', description: 'Data do lançamento até AAAA-MM-DD' },
        situacao: { type: 'string', enum: ['pago', 'pendente', 'todos'] },
        limite: { type: 'integer', minimum: 1, maximum: 200 }
      }
    }
  },
  {
    name: 'totais_por_categoria',
    description: 'Soma por categoria em um período, separando pago e pendente. Use para comparar categorias ou meses.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        perfil: { type: 'string', enum: perfisValidos() },
        tipo: { type: 'string', enum: ['in', 'out'] },
        de: { type: 'string', format: 'date' },
        ate: { type: 'string', format: 'date' }
      },
      required: ['tipo', 'de', 'ate']
    }
  }
];

// deno-lint-ignore no-explicit-any
type Args = Record<string, any>;

function filtrar(linhas: Lanc[], a: Args): Lanc[] {
  const busca = a.busca ? String(a.busca).toLowerCase() : '';
  return linhas.filter(l =>
    (!a.perfil || l.profile === a.perfil) &&
    (!a.tipo || l.kind === a.tipo) &&
    (!a.categoria || l.cat === a.categoria) &&
    (!busca || l.obs.toLowerCase().includes(busca) || l.cat.toLowerCase().includes(busca)) &&
    (!a.de || l.venc >= a.de) && (!a.ate || l.venc <= a.ate) &&
    (!a.situacao || a.situacao === 'todos' || (a.situacao === 'pago' ? !!l.pag : !l.pag)));
}

export function executarFerramenta(nome: string, a: Args, linhas: Lanc[], hojeRef: string) {
  if (nome === 'consultar_lancamentos') {
    const achados = filtrar(linhas, a).sort((x, y) => y.venc.localeCompare(x.venc));
    const limite = Math.min(200, Math.max(1, Number(a.limite) || 50));
    return {
      quantidade: achados.length, soma: somaVal(achados), mostrando: Math.min(limite, achados.length),
      lancamentos: achados.slice(0, limite).map(l => ({
        perfil: l.profile, tipo: l.kind, cat: l.cat, obs: l.obs, val: Number(l.val), forma: l.forma,
        cartao: l.card, parcela: l.parc, data_lancamento: l.venc, situacao: l.pag ? `pago em ${l.pag}` : l.venc < hojeRef ? 'atrasado' : 'a vencer'
      }))
    };
  }
  if (nome === 'totais_por_categoria') {
    const mapa: Record<string, { pago: number; pendente: number; quantidade: number }> = {};
    filtrar(linhas, { perfil: a.perfil, tipo: a.tipo, de: a.de, ate: a.ate }).forEach(l => {
      const c = (mapa[`${l.profile} · ${l.cat}`] ||= { pago: 0, pendente: 0, quantidade: 0 });
      c[l.pag ? 'pago' : 'pendente'] = r2(c[l.pag ? 'pago' : 'pendente'] + Number(l.val));
      c.quantidade++;
    });
    return Object.entries(mapa).map(([categoria, v]) => ({ categoria, ...v, total: r2(v.pago + v.pendente) }))
      .sort((x, y) => y.total - x.total);
  }
  throw new Error('ferramenta desconhecida: ' + nome);
}
