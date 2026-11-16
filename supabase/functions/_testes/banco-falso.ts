// Banco em memória com a mesma forma de chamada do supabase-js, só no que as funções usam.
// deno-lint-ignore-file no-explicit-any
type Linha = Record<string, any>;

const CHAVES: Record<string, string> = {
  whatsapp_mensagens: 'message_id', whatsapp_vinculos: 'phone', whatsapp_codigos: 'codigo', entries: 'id', cfo_mensagens: 'id'
};
const UNICOS: Record<string, string[]> = { whatsapp_vinculos: ['user_id'], whatsapp_codigos: ['user_id'] };

export class BancoFalso {
  tabelas: Record<string, Linha[]> = {};
  usuarios: Record<string, { id: string; email: string }> = {};
  relogio = () => new Date();
  falharEm: string | null = null;
  gravacoes = 0;

  tabela(t: string) { return (this.tabelas[t] ||= []); }
  from(t: string) { return new Consulta(this, t); }
  auth = {
    getUser: async (token: string) => {
      const u = this.usuarios[token];
      return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: 'jwt inválido' } };
    }
  };
}

class Consulta {
  private filtros: ((r: Linha) => boolean)[] = [];
  private op = 'select';
  private dados: any;
  private opts: any = {};
  private ordem: [string, boolean][] = [];
  private lim: number | null = null;
  private faixa: [number, number] | null = null;
  private umSo: 'maybe' | 'single' | null = null;

  constructor(private b: BancoFalso, private t: string) {}
  select(_c?: string, opts?: any) { if (this.op === 'select') this.opts = opts || {}; return this; }
  insert(d: any) { this.op = 'insert'; this.dados = d; return this; }
  update(d: any) { this.op = 'update'; this.dados = d; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(k: string, v: any) { this.filtros.push(r => r[k] === v); return this; }
  is(k: string, v: any) { this.filtros.push(r => (r[k] ?? null) === v); return this; }
  gt(k: string, v: any) { this.filtros.push(r => r[k] > v); return this; }
  gte(k: string, v: any) { this.filtros.push(r => r[k] >= v); return this; }
  in(k: string, v: any[]) { this.filtros.push(r => v.includes(r[k])); return this; }
  or(expr: string) {
    const conds = expr.split(',').map(c => { const [k, , ...v] = c.split('.'); return [k, v.join('.')]; });
    this.filtros.push(r => conds.some(([k, v]) => String(r[k]) === v));
    return this;
  }
  order(k: string, o?: { ascending?: boolean }) { this.ordem.push([k, o?.ascending !== false]); return this; }
  limit(n: number) { this.lim = n; return this; }
  range(a: number, z: number) { this.faixa = [a, z]; return this; }
  maybeSingle() { this.umSo = 'maybe'; return this; }
  single() { this.umSo = 'single'; return this; }
  then(ok: any, erro: any) { return Promise.resolve().then(() => this.rodar()).then(ok, erro); }

  private rodar(): any {
    if (this.b.falharEm === this.t) return { data: null, error: { message: 'falha simulada' } };
    const tab = this.b.tabela(this.t);
    if (this.op === 'insert') {
      // Como no Postgres, cada gravação recebe um horário próprio, sempre crescente.
      const agora = new Date(this.b.relogio().getTime() + ++this.b.gravacoes).toISOString();
      const novos: Linha[] = (Array.isArray(this.dados) ? this.dados : [this.dados]).map((d: Linha) => ({
        id: crypto.randomUUID(), created_at: agora, deleted_at: null, status: 'recebida', entry_ids: [], ...d
      }));
      const pk = CHAVES[this.t];
      for (const n of novos) {
        if (pk && tab.some(r => r[pk] === n[pk])) return { data: null, error: { code: '23505', message: 'duplicada' } };
        for (const u of UNICOS[this.t] || []) if (tab.some(r => r[u] === n[u])) return { data: null, error: { code: '23505', message: 'duplicada' } };
      }
      tab.push(...novos);
      return { data: null, error: null };
    }
    const alvo = tab.filter(r => this.filtros.every(f => f(r)));
    if (this.op === 'update') { alvo.forEach(r => Object.assign(r, this.dados)); return { data: null, error: null }; }
    if (this.op === 'delete') { this.b.tabelas[this.t] = tab.filter(r => !alvo.includes(r)); return { data: null, error: null }; }
    if (this.opts.head) return { data: null, count: alvo.length, error: null };
    let res = alvo.slice();
    for (const [k, asc] of [...this.ordem].reverse()) res.sort((a, z) => (a[k] < z[k] ? -1 : a[k] > z[k] ? 1 : 0) * (asc ? 1 : -1));
    if (this.faixa) res = res.slice(this.faixa[0], this.faixa[1] + 1);
    if (this.lim != null) res = res.slice(0, this.lim);
    res = structuredClone(res);
    if (this.umSo) return { data: res[0] ?? null, error: null };
    return { data: res, error: null };
  }
}
