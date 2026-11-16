// Ponto de entrada da função "cfo" (chamada pelo site com o login da pessoa).
import { criarHandler } from './logica.ts';
import { clienteServico } from '../_shared/comum.ts';
import { conversar } from '../_shared/gemini.ts';

const origens = (Deno.env.get('SITE_ORIGENS') ?? 'https://controle-financeiro-integrado.vercel.app')
  .split(',').map(s => s.trim()).filter(Boolean);

Deno.serve(criarHandler({ db: clienteServico(), conversar, origens }));
