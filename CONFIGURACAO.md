# Configuração do login e do banco de dados

O site é estático e fica na Vercel. O login e os dados ficam no Supabase, que tem plano gratuito. Faça os passos nesta ordem.

## 1. Criar o projeto no Supabase

1. Crie uma conta em [supabase.com](https://supabase.com) e clique em **New project**.
2. Escolha a região **South America (São Paulo)** e guarde a senha do banco.
3. Abra **SQL Editor > New query**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
4. Em uma nova consulta, autorize o seu e-mail do Google a criar o espaço (use letras minúsculas):

   ```sql
   insert into public.allowed_creators (email) values ('seu-email@gmail.com');
   ```

   Rode isso só no Supabase. Não coloque seu e-mail em arquivos do repositório, porque ele é público.

## 2. Publicar o site na Vercel

1. Em [vercel.com/new](https://vercel.com/new), importe o repositório `CONTROLE-FINANCEIRO-INTEGRADO`.
2. Em **Framework Preset**, deixe **Other** e clique em **Deploy**.
3. Anote o endereço gerado, por exemplo `https://controle-financeiro-integrado.vercel.app`.

## 3. Ligar o login com Google

**No [Google Cloud Console](https://console.cloud.google.com):**

1. Crie um projeto.
2. Em **Google Auth Platform > Branding**, preencha o nome do app e os e-mails de contato.
3. Em **Audience**, escolha **External** e clique em **Publish app** para que qualquer conta Google consiga entrar. Sem publicar, adicione as duas contas em **Test users**.
4. Em **Clients > Create client**, escolha **Web application**.
5. Em **Authorized JavaScript origins**, adicione o endereço da Vercel.
6. Em **Authorized redirect URIs**, adicione `https://SEU-PROJETO.supabase.co/auth/v1/callback`. O endereço exato aparece no passo seguinte.
7. Copie o **Client ID** e o **Client secret**.

**No Supabase, em Authentication:**

1. Em **Sign In / Providers > Google**, ative, cole o Client ID e o Client secret e salve.
2. Em **Sign In / Providers > Email**, desative o provedor, já que o site só usa Google e Apple.
3. Em **URL Configuration**, coloque o endereço da Vercel em **Site URL** e também em **Redirect URLs**.

## 4. Conectar o site ao Supabase

1. No Supabase, copie a **Project URL** (`https://SEU-PROJETO.supabase.co`, sem `/rest/v1/`) e a chave **publishable** (`sb_publishable_...`, chamada de **anon public** em projetos antigos).
2. Preencha [`assets/config.js`](assets/config.js) com esses dois valores e envie para o GitHub. A Vercel publica sozinha.

A chave `publishable` pode ficar no repositório, porque as regras do banco protegem os dados. **Nunca** use a chave `secret` ou `service_role` no site.

## 5. Entrar e convidar a segunda pessoa

1. Abra o site, clique em **Entrar**, use a conta Google autorizada no passo 1 e crie o espaço.
2. Em **Conta**, copie o código de convite.
3. A segunda pessoa entra com a própria conta Google e informa o código. O espaço aceita 2 contas; depois disso, o convite é recusado.

## 6. Login com Apple (opcional)

O botão já está pronto, mas fica oculto, porque a Apple exige o **Apple Developer Program**, que é pago por ano.

1. Em [developer.apple.com](https://developer.apple.com/account), crie um **Services ID** com Sign in with Apple e uma chave do tipo **Sign in with Apple**.
2. Use o mesmo endereço de callback do Supabase como **Return URL**.
3. No Supabase, em **Sign In / Providers > Apple**, preencha os dados. O segredo gerado com essa chave expira e precisa ser renovado a cada 6 meses.
4. Em [`assets/config.js`](assets/config.js), mude `APPLE_LOGIN` para `true`.

Uma mesma pessoa que entrar com Google e depois com Apple pode ser tratada como duas contas, então cada pessoa deve escolher um dos dois.

## Para vender no futuro

A base já separa os dados de cada cliente por espaço. Ainda falta:

- **Pagamento:** trocar a tabela `allowed_creators` pela confirmação de compra.
- **Planos:** usar `plan` e `max_members` (`individual` com 1 conta, `conjunto` com 2).
- **Personalização:** hoje os nomes, as categorias e os cartões estão em `assets/data.js`, iguais para todos. Cada cliente precisará cadastrar os próprios.
- **Exigências legais:** termos de uso, política de privacidade e adequação à LGPD.
