// Ponto de entrada da função "whatsapp": recebe os avisos do servidor da Evolution API.
import { criarHandler } from './logica.ts';
import { clienteServico } from '../_shared/comum.ts';
import { gerarJson } from '../_shared/gemini.ts';
import { evolutionReal } from '../_shared/evolution.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

Deno.serve(criarHandler({
  db: clienteServico(),
  evo: evolutionReal(),
  gerarJson,
  waitUntil: p => EdgeRuntime.waitUntil(p)
}));
