// Ponto de entrada da função "whatsapp" (webhook da Meta).
import { criarHandler } from './logica.ts';
import { clienteServico } from '../_shared/comum.ts';
import { gerarJson } from '../_shared/gemini.ts';
import { baixarMidia, enviarTexto, marcarLido } from './meta.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

Deno.serve(criarHandler({
  db: clienteServico(),
  appSecret: Deno.env.get('META_APP_SECRET') ?? '',
  verifyToken: Deno.env.get('META_VERIFY_TOKEN') ?? '',
  phoneNumberId: Deno.env.get('META_PHONE_NUMBER_ID') || undefined,
  gerarJson,
  baixarMidia,
  enviarTexto,
  marcarLido,
  waitUntil: p => EdgeRuntime.waitUntil(p)
}));
