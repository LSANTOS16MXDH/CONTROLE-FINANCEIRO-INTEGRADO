/* Configuração pública do site. A chave "publishable" (antiga "anon") do Supabase
   foi feita para ficar no navegador: quem protege os dados são as regras de
   supabase/schema.sql. Nunca coloque aqui a chave "secret" ou "service_role".

   Sem URL e chave, o site roda em modo local, salvando só neste navegador. */
window.CFI_CONFIG = {
  SUPABASE_URL: 'https://hrkslzykntlfepclclcu.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_sONXPXMXDSWUtw3b3nc0pQ_pDg-XjnY',
  APPLE_LOGIN: false // ligue depois de configurar o provedor Apple no Supabase
};
