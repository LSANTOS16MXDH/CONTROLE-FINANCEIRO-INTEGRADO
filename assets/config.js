/* Configuração pública do site. A "anon key" do Supabase foi feita para ficar
   no navegador: quem protege os dados são as regras de supabase/schema.sql.
   Nunca coloque aqui a chave "service_role".

   Sem URL e chave, o site roda em modo local, salvando só neste navegador. */
window.CFI_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  APPLE_LOGIN: false // ligue depois de configurar o provedor Apple no Supabase
};
