// Perfis de cada CFI (titular, parceiro(a), casa e empresa) para os agentes.
// Segue as mesmas regras de assets/data.js (configurar e opcoes): os nomes e as
// categorias próprias vêm da linha do CFI em workspaces; o que faltar sai do
// modelo genérico em modelo.json (gerado por scripts/gerar-perfis.mjs).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import dados from './modelo.json' with { type: 'json' };

export type Kind = 'in' | 'out';
export interface Opcoes { categorias: { nome: string; descricao: string }[]; formas: string[]; cartoes: string[] }
export interface Perfil { nome: string; curto: string; in: Opcoes; out: Opcoes }
export type Perfis = Record<string, Perfil>;

/** O que os agentes leem da linha do CFI. */
export interface Espaco {
  plan?: string | null;
  nome_titular?: string | null;
  nome_parceiro?: string | null;
  nome_empresa?: string | null;
  estrutura?: unknown;
}

export const TIPOS = dados.tipos as string[];
const FORMAS = dados.formas as Record<'saida' | 'entrada' | 'empSaida' | 'empEntrada', string[]>;
// deno-lint-ignore no-explicit-any
const MODELO = dados.modelo as Record<string, any>;

// deno-lint-ignore no-explicit-any
const mapa = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {});
const lista = (v: unknown): string[] | null =>
  Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()) : null;

export function montarPerfis(ws: Espaco | null | undefined): Perfis {
  const w = ws ?? {};
  const est = mapa(w.estrutura);
  const casal = w.plan !== 'individual';
  const nomes: Record<string, string> = {
    titular: (w.nome_titular || 'Titular').trim(),
    parceiro: (w.nome_parceiro || 'Parceiro(a)').trim(),
    casa: 'Casa',
    empresa: (w.nome_empresa || 'Empresa').trim()
  };
  const ordem = casal ? ['titular', 'parceiro', 'casa', 'empresa'] : ['titular', 'empresa'];

  const base: Record<string, { catIn: string[]; catOut: string[]; descIn: Record<string, string>; descOut: Record<string, string>; cartoes: string[] }> = {};
  for (const p of ordem) {
    const m = mapa(MODELO[p]), e = mapa(est[p]);
    base[p] = {
      catIn: lista(e.catIn) ?? lista(m.catIn) ?? [],
      catOut: lista(e.catOut) ?? lista(m.catOut) ?? [],
      descIn: { ...mapa(m.descIn), ...mapa(e.descIn) },
      descOut: { ...mapa(m.descOut), ...mapa(e.descOut) },
      cartoes: lista(e.cartoes) ?? lista(m.cartoes) ?? []
    };
  }
  base.empresa.cartoes = lista(mapa(est.empresa).cartoes) ?? base.titular.cartoes.slice();
  const contaPJ = String(mapa(est.empresa).contaPJ || '').trim() || String(mapa(MODELO.empresa).contaPJ || 'CONTA PJ');

  // Cartões da casa: os de cada pessoa com o nome dela ("NUBANK ANA").
  const cartoesCasa = casal
    ? ['titular', 'parceiro'].flatMap(p => base[p].cartoes.map(c => `${c} ${nomes[p].toUpperCase()}`))
    : [];
  const unicos = (l: string[]) => [...new Set(l)];

  const perfis: Perfis = {};
  for (const p of ordem) {
    const b = base[p], emp = p === 'empresa';
    const cartoesSaida = emp ? unicos([contaPJ, '-', ...b.cartoes]) : p === 'casa' ? ['-', ...unicos(cartoesCasa)] : ['-', ...b.cartoes];
    const tipo = (k: Kind): Opcoes => ({
      categorias: (k === 'out' ? b.catOut : b.catIn).map(nome => ({ nome, descricao: (k === 'out' ? b.descOut : b.descIn)[nome] || '' })),
      formas: emp ? (k === 'out' ? FORMAS.empSaida : FORMAS.empEntrada) : (k === 'out' ? FORMAS.saida : FORMAS.entrada),
      cartoes: k === 'out' ? cartoesSaida : []
    });
    perfis[p] = { nome: nomes[p], curto: nomes[p], in: tipo('in'), out: tipo('out') };
  }
  return perfis;
}

/** Perfis do CFI. Toda consulta dos agentes filtra pelo CFI de quem chamou. */
export async function carregarPerfis(db: SupabaseClient, ws: string): Promise<Perfis> {
  const { data, error } = await db.from('workspaces')
    .select('plan,nome_titular,nome_parceiro,nome_empresa,estrutura').eq('id', ws).maybeSingle();
  if (error) throw error;
  return montarPerfis(data as Espaco | null);
}
