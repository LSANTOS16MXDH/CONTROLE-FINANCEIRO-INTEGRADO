// Utilidades comuns às funções dos agentes.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import type { Alvo, Lanc } from './resumo.ts';

/** Cliente com a chave secreta: ignora as regras de acesso, então toda consulta filtra o espaço. */
export function clienteServico(): SupabaseClient {
  let chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const novas = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (novas) { try { chave = JSON.parse(novas).default || chave; } catch { /* usa a antiga */ } }
  if (!chave) throw new Error('chave secreta do Supabase indisponível');
  return createClient(Deno.env.get('SUPABASE_URL')!, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Data de hoje no horário de Brasília (AAAA-MM-DD). */
export function hojeSP(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

export function diaDaSemanaSP(agora = new Date()): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' }).format(agora);
}

/** Todos os lançamentos ativos do espaço (o PostgREST devolve até 1000 por vez). */
export async function carregarDados(db: SupabaseClient, ws: string): Promise<{ linhas: Lanc[]; alvos: Alvo[] }> {
  const linhas: Lanc[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db.from('entries')
      .select('id,profile,kind,cat,obs,val,forma,tipo,card,parc,venc,pag,origem')
      .eq('workspace_id', ws).is('deleted_at', null).order('venc').order('id').range(de, de + 999);
    if (error) throw error;
    linhas.push(...(data as Lanc[]));
    if (data.length < 1000) break;
  }
  const { data: alvos, error } = await db.from('targets').select('scope,key,value').eq('workspace_id', ws);
  if (error) throw error;
  return { linhas, alvos: alvos as Alvo[] };
}
