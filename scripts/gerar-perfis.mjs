// Copia perfis, categorias, formas de pagamento e cartões de assets/data.js para
// supabase/functions/_shared/perfis.json, usado pelos agentes no servidor.
// Rode sempre que mudar as contas no data.js:  node scripts/gerar-perfis.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const codigo = readFileSync(raiz + 'assets/data.js', 'utf8');

// data.js é um script de navegador: roda num contexto isolado com um "window" mínimo.
const window = { CFI_CONFIG: { SUPABASE_URL: 'x', SUPABASE_ANON_KEY: 'x' } };
vm.runInNewContext(codigo, { window, crypto: globalThis.crypto, Date, Math, Intl, console });
const F = window.FIN;

const perfis = {};
for (const [id, p] of Object.entries(F.PROFILES)) {
  const tipo = kind => ({
    categorias: (kind === 'out' ? p.catOut : p.catIn).map(c => ({ nome: c, descricao: ((kind === 'out' ? p.descOut : p.descIn) || {})[c] || '' })),
    ...F.opcoes(id, kind)
  });
  perfis[id] = { nome: p.nome, curto: p.curto, in: tipo('in'), out: tipo('out') };
}

const destino = raiz + 'supabase/functions/_shared/perfis.json';
writeFileSync(destino, JSON.stringify({ tipos: F.TIPOS, perfis }, null, 2) + '\n');
console.log('Gerado:', destino.replace(raiz, ''));
