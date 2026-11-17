// Ponto de entrada da função "whatsapp-conexao" (chamada pelo site com o login da pessoa).
import { criarHandler } from './logica.ts';
import { clienteServico } from '../_shared/comum.ts';
import { evolutionReal } from '../_shared/evolution.ts';

const origens = (Deno.env.get('SITE_ORIGENS') ?? 'https://controle-financeiro-integrado.vercel.app')
  .split(',').map(s => s.trim()).filter(Boolean);
const base = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');

Deno.serve(criarHandler({ db: clienteServico(), evo: evolutionReal(), urlWebhook: `${base}/functions/v1/whatsapp`, origens }));
