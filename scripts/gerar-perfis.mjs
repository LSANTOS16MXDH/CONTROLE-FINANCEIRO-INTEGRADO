// Copia o modelo de categorias, as formas de pagamento e os tipos de
// assets/data.js para supabase/functions/_shared/modelo.json, usado pelos
// agentes no servidor. Os nomes e as categorias próprias de cada CFI ficam no
// banco (workspaces); aqui vai só o modelo genérico, igual para todos.
// Rode sempre que mudar o modelo no data.js:  node scripts/gerar-perfis.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const codigo = readFileSync(raiz + 'assets/data.js', 'utf8');

// data.js é um script de navegador: roda num contexto isolado com um "window" mínimo.
const window = { CFI_CONFIG: { SUPABASE_URL: 'x', SUPABASE_ANON_KEY: 'x' } };
vm.runInNewContext(codigo, { window, crypto: globalThis.crypto, Date, Math, Intl, console });
const F = window.FIN;

const destino = raiz + 'supabase/functions/_shared/modelo.json';
writeFileSync(destino, JSON.stringify({ tipos: F.TIPOS, formas: F.FORMAS, modelo: F.MODELO }, null, 2) + '\n');
console.log('Gerado:', destino.replace(raiz, ''));
