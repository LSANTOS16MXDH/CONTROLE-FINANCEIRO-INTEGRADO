# Configuração do login e do banco de dados

O site é estático e fica na Vercel. O login e os dados ficam no Supabase, que tem plano gratuito. Faça os passos nesta ordem.

## 1. Criar o projeto no Supabase

1. Crie uma conta em [supabase.com](https://supabase.com) e clique em **New project**.
2. Escolha a região **South America (São Paulo)** e guarde a senha do banco.
3. Abra **SQL Editor > New query**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
4. Em uma nova consulta, rode do mesmo jeito o [`supabase/cfi-acesso.sql`](supabase/cfi-acesso.sql). Ele guarda os nomes de cada CFI e cria os pedidos de entrada do(a) parceiro(a). Pode rodar de novo sem problema.
   Depois, rode também o [`supabase/panorama.sql`](supabase/panorama.sql), que ativa o Panorama de contas (contas fixas, cartões e faturas). Também pode rodar de novo.
5. Cada compra libera um e-mail do Google para criar um CFI (use letras minúsculas):

   ```sql
   insert into public.allowed_creators (email) values ('email-de-quem-comprou@gmail.com');
   ```

   Rode isso só no Supabase. Não coloque e-mails em arquivos do repositório, porque ele é público.

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

## 5. Criar o CFI e entrar em um CFI existente

A primeira tela tem duas opções, e as duas pedem o login com Google.

**Quem comprou: Criar um novo CFI**

1. Entra com o e-mail liberado no passo 1.5 e escolhe **Conta conjunta** (titular, parceiro(a), casal e empresa) ou **Conta individual** (titular e empresa).
2. Dá os nomes: o próprio, o da empresa e, na conjunta, o nome e o **e-mail Google do(a) parceiro(a)**. A área **Casal** não tem nome.
3. O painel abre com esses nomes em todas as telas.

**O(a) parceiro(a): Entrar em um CFI existente**

1. Entra com o e-mail Google que o titular cadastrou e digita o e-mail de quem comprou.
2. O site mostra o nome do titular para conferir. Confirmando, o pedido vai para o titular.
3. O titular vê o pedido no topo de qualquer tela, com o nome e o e-mail de quem pediu, e clica em **Autorizar** ou **Recusar**. Autorizado, o CFI abre sozinho para o(a) parceiro(a).

Só o e-mail cadastrado consegue pedir para entrar. Para qualquer outro e-mail, o site responde que o CFI não existe, sem mostrar nomes. Enquanto o(a) parceiro(a) não entra, o titular pode corrigir o nome e o e-mail em **Conta**.

**Privacidade:** cada CFI só enxerga os próprios nomes, valores e lançamentos; as regras do banco (RLS) barram o acesso de qualquer outra conta. Quem administra o projeto no Supabase (o dono da conta do Supabase) ainda consegue abrir as tabelas pelo painel, como em qualquer sistema na nuvem. Os agentes (WhatsApp e CFO) também precisam ler os lançamentos para funcionar.

## 5.1 Panorama de contas

Em **Panorama**, cada área (titular, parceiro(a), casal e empresa) tem um calendário de janeiro a dezembro. Cada conta aparece no dia do vencimento, e cada mês tem um relatório ao lado.

- **Situação:** Atrasado (vermelho), Previsto (amarelo) e Concluído (verde). Ela vem das datas: com pagamento, Concluído; vencida sem pagamento, Atrasado; senão, Previsto. Clicando na conta, dá para mudar à mão.
- **Cartões:** em **Contas fixas e cartões**, informe a bandeira e os dias de fechamento e de vencimento de cada cartão. A partir daí, as compras no crédito (parceladas inclusive) se juntam numa linha por fatura, no dia em que ela vence. Compra feita no dia do fechamento ou depois vai para a fatura seguinte. Marcar a fatura como Concluído confirma o pagamento de todas as compras dela. A fatura dos Dashboards usa a mesma regra.
- **Contas fixas:** aluguel, internet, consórcio etc., com valor, dia do vencimento, mês de início e prazo (ou sem prazo). Cada uma vira um lançamento por mês, que também aparece em Lançamentos, Dashboards e para o CFO. Ao editar, os meses em aberto acompanham a mudança, e os já pagos não mudam. As contas sem prazo são geradas até dezembro do ano seguinte, e o site completa os meses sozinho.
- **Imprevistos:** o **+** de cada dia, ou o botão **+ Conta imprevista**, lança uma conta que não estava planejada, já com a situação escolhida.

## 6. Login com Apple (opcional)

O botão já está pronto, mas fica oculto, porque a Apple exige o **Apple Developer Program**, que é pago por ano.

1. Em [developer.apple.com](https://developer.apple.com/account), crie um **Services ID** com Sign in with Apple e uma chave do tipo **Sign in with Apple**.
2. Use o mesmo endereço de callback do Supabase como **Return URL**.
3. No Supabase, em **Sign In / Providers > Apple**, preencha os dados. O segredo gerado com essa chave expira e precisa ser renovado a cada 6 meses.
4. Em [`assets/config.js`](assets/config.js), mude `APPLE_LOGIN` para `true`.

Uma mesma pessoa que entrar com Google e depois com Apple pode ser tratada como duas contas, então cada pessoa deve escolher um dos dois.

## 7. Agentes inteligentes (WhatsApp e CFO)

Os dois agentes usam o **Google Gemini** (Google AI Studio) e rodam em funções do Supabase (Edge Functions), que ficam em `supabase/functions/`. As chaves ficam só nos segredos do Supabase, nunca no código.

> **Privacidade:** no plano gratuito da API do Gemini, o Google pode usar o conteúdo enviado (comprovantes, áudios e números) para melhorar os produtos dele, e revisores humanos podem ler esse conteúdo. Para evitar isso, ative o faturamento no projeto do Google Cloud ligado à chave: o plano pago não usa os dados para isso. O código não muda.

### 7.1 Banco de dados

No **SQL Editor** do Supabase, cole todo o conteúdo de [`supabase/agentes.sql`](supabase/agentes.sql) e clique em **Run**. Rode o `cfi-acesso.sql` (passo 1.4) depois dele, se ainda não rodou. Até lá, a tela **Agentes** do site mostra um aviso, e o resto do site funciona normalmente.

### 7.2 Publicar as funções

Em um terminal, dentro da pasta do projeto:

```bash
npx supabase@2.122.0 login
npx supabase@2.122.0 link --project-ref hrkslzykntlfepclclcu
npx supabase@2.122.0 secrets set GEMINI_API_KEY=SUA_CHAVE_DO_AI_STUDIO
npx supabase@2.122.0 functions deploy cfo --use-api
npx supabase@2.122.0 functions deploy whatsapp --use-api
```

Com isso, o **CFO** já funciona na tela **Agentes**. Os modelos podem ser trocados pelos segredos `GEMINI_MODELO` (padrão `gemini-3.8-flash`) e `GEMINI_MODELO_RESERVA` (padrão `gemini-3.5-flash-lite`, usado quando o principal está sobrecarregado ou sem cota).

Os agentes leem os nomes e as categorias do CFI de quem está falando. Sempre que mudar o modelo de categorias (`MODELO`), as formas ou os tipos em `assets/data.js`, rode `node scripts/gerar-perfis.mjs` e publique as funções de novo.

### 7.3 Ligar o WhatsApp (Meta)

1. Em [developers.facebook.com](https://developers.facebook.com/apps), crie um app do tipo **Business** e adicione o produto **WhatsApp**.
2. Em **WhatsApp › API Setup**, anote o **Phone number ID** do número de teste e adicione os números de vocês dois em **To** (o número de teste só conversa com até 5 números cadastrados).
3. Gere um token permanente: em [business.facebook.com](https://business.facebook.com/settings/system-users), crie um **usuário do sistema**, dê a ele acesso ao app e gere um token com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`. O token temporário da tela de teste expira em 24 horas.
4. Em **App settings › Basic**, copie o **App Secret**.
5. Grave os segredos (troque os valores; o `META_VERIFY_TOKEN` é uma senha que você inventa):

   ```bash
   npx supabase@2.122.0 secrets set META_ACCESS_TOKEN=... META_APP_SECRET=... META_PHONE_NUMBER_ID=... META_VERIFY_TOKEN=uma-senha-longa-qualquer
   ```

6. Em **WhatsApp › Configuration › Webhook**, informe:
   - **Callback URL:** `https://hrkslzykntlfepclclcu.supabase.co/functions/v1/whatsapp`
   - **Verify token:** o mesmo `META_VERIFY_TOKEN`
   
   Depois, em **Webhook fields**, assine o campo **messages**.
7. **Use um número brasileiro.** A Meta restringe mensagens de números de outros países para celulares do Brasil (erro 130497). Com o número de teste americano, o agente recebe e lança, mas as respostas não chegam. Em **WhatsApp › API Setup › Add phone number**, cadastre um número do Brasil que não esteja em uso no aplicativo do WhatsApp e troque o `META_PHONE_NUMBER_ID` pelo dele.
8. Em [`assets/config.js`](assets/config.js), preencha `WHATSAPP_NUMERO` com o número do agente (só dígitos, com 55), para o site mostrar o botão **Abrir no WhatsApp**.

### 7.4 Vincular os números

Cada pessoa abre **Agentes** no site, escolhe o perfil padrão e clica em **Gerar código**. Depois envia `VINCULAR CÓDIGO` ao número do agente pelo próprio WhatsApp. O código vale por 15 minutos. A partir daí, fotos, PDFs, áudios e mensagens com gastos ou recebimentos viram lançamentos, e a resposta **desfazer** apaga o último.

### 7.5 Testes

```bash
npx deno@2.9.6 test --allow-env supabase/functions/_testes/agentes.test.ts
```

## Para vender no futuro

A base já separa os dados de cada cliente por espaço. Ainda falta:

- **Pagamento:** hoje cada compra é liberada à mão em `allowed_creators`. Falta inserir o e-mail automaticamente quando a compra for confirmada.
- **Categorias próprias:** os nomes já são de cada CFI. As categorias e os cartões vêm de um modelo genérico (`MODELO` em `assets/data.js`); cada CFI pode ter os próprios em `workspaces.estrutura`, mas ainda não há tela para o cliente editar.
- **Exigências legais:** termos de uso, política de privacidade e adequação à LGPD.
