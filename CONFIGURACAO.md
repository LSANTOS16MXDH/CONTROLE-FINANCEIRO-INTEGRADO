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

1. Abra o site, entre com a conta Google autorizada no passo 1 e crie o espaço.
2. Em **Conta**, copie o código de convite.
3. A segunda pessoa entra com a própria conta Google e informa o código. O espaço aceita 2 contas; depois disso, o convite é recusado.

## 6. Login com Apple (opcional)

O botão já está pronto, mas fica oculto, porque a Apple exige o **Apple Developer Program**, que é pago por ano.

1. Em [developer.apple.com](https://developer.apple.com/account), crie um **Services ID** com Sign in with Apple e uma chave do tipo **Sign in with Apple**.
2. Use o mesmo endereço de callback do Supabase como **Return URL**.
3. No Supabase, em **Sign In / Providers > Apple**, preencha os dados. O segredo gerado com essa chave expira e precisa ser renovado a cada 6 meses.
4. Em [`assets/config.js`](assets/config.js), mude `APPLE_LOGIN` para `true`.

Uma mesma pessoa que entrar com Google e depois com Apple pode ser tratada como duas contas, então cada pessoa deve escolher um dos dois.

## 7. Agentes inteligentes (WhatsApp e CFO)

Os dois agentes usam o **Google Gemini** (Google AI Studio) e rodam em funções do Supabase (Edge Functions), que ficam em `supabase/functions/`. As chaves ficam só nos segredos do Supabase, nunca no código.

> **Privacidade:** no plano gratuito da API do Gemini, o Google pode usar o conteúdo enviado ao assistente (comprovantes, áudios e mensagens) para melhorar os produtos dele, e revisores humanos podem ler esse conteúdo. Para evitar isso, ative o faturamento no projeto do Google Cloud ligado à chave: o plano pago não usa os dados para isso. O código não muda.

### 7.1 Banco de dados

No **SQL Editor** do Supabase, rode todo o conteúdo de [`supabase/agentes.sql`](supabase/agentes.sql) e, depois, o de [`supabase/whatsapp-conexao.sql`](supabase/whatsapp-conexao.sql). Até lá, a tela **Agentes** do site mostra um aviso, e o resto do site funciona normalmente.

### 7.2 Publicar as funções

Em um terminal, dentro da pasta do projeto:

```bash
npx supabase@2.122.0 login
npx supabase@2.122.0 link --project-ref hrkslzykntlfepclclcu
npx supabase@2.122.0 secrets set GEMINI_API_KEY=SUA_CHAVE_DO_AI_STUDIO
npx supabase@2.122.0 functions deploy cfo --use-api
npx supabase@2.122.0 functions deploy whatsapp --use-api
npx supabase@2.122.0 functions deploy whatsapp-conexao --use-api
```

Com isso, o **CFO** já funciona na tela **Agentes**. Os modelos podem ser trocados pelos segredos `GEMINI_MODELO` (padrão `gemini-3.8-flash`) e `GEMINI_MODELO_RESERVA` (padrão `gemini-3.5-flash-lite`, usado quando o principal está sobrecarregado ou sem cota).

Sempre que mudar as contas, categorias, formas ou cartões em `assets/data.js`, rode `node scripts/gerar-perfis.mjs` e publique as funções de novo.

### 7.3 Servidor do WhatsApp (Evolution API), feito uma única vez

O WhatsApp de cada pessoa fica conectado como **aparelho conectado**, igual ao WhatsApp Web, por um servidor da [Evolution API](https://github.com/evolution-foundation/evolution-api) (código aberto). Esse servidor precisa ficar ligado o tempo todo. A opção gratuita é a **Oracle Cloud Always Free**.

> **Antes de usar:** a Evolution API não é oficial do WhatsApp. O WhatsApp proíbe clientes não oficiais e pode bloquear números que usam esse tipo de conexão. O risco é menor com pouco uso (a pessoa escrevendo para si mesma), mas existe. Para vender o sistema, o caminho sem esse risco é a API oficial da Meta.

1. **Crie a conta** em [oracle.com/cloud/free](https://www.oracle.com/cloud/free/). A Oracle pede um cartão só para confirmar a identidade e não cobra nada nos recursos *Always Free*. Escolha a região **Brazil East (São Paulo)**.
2. **Crie a máquina:** em **Compute › Instances › Create instance**:
   - **Image:** Canonical Ubuntu 24.04.
   - **Shape:** Ampere **VM.Standard.A1.Flex** com 1 OCPU e 6 GB de memória (gratuito). Se aparecer *Out of capacity*, tente mais tarde ou use a **VM.Standard.E2.1.Micro**, também gratuita.
   - **SSH keys:** deixe **Generate a key pair** e baixe a chave privada.
   - Clique em **Create** e anote o **Public IP address**.
3. **Abra as portas 80 e 443:** na página da máquina, clique na **Subnet**, depois na **Default Security List** e em **Add Ingress Rules**:
   - **Source CIDR:** `0.0.0.0/0`
   - **Destination port range:** `80,443`
4. **Entre na máquina** pelo terminal do Windows (PowerShell), trocando o caminho da chave e o IP:

   ```bash
   ssh -i C:\caminho\da\chave.key ubuntu@IP_DA_MAQUINA
   ```

5. **Instale o servidor** com estes dois comandos, dentro da máquina:

   ```bash
   git clone https://github.com/LSANTOS16MXDH/CONTROLE-FINANCEIRO-INTEGRADO.git cfi
   bash cfi/servidor/evolution/instalar.sh
   ```

   Em alguns minutos, ele mostra `EVOLUTION_URL` (um endereço `https://...sslip.io`, com certificado gratuito) e `EVOLUTION_API_KEY`.
6. **Grave os dois valores no Supabase**, no seu computador, dentro da pasta do projeto:

   ```bash
   npx supabase@2.122.0 secrets set EVOLUTION_URL=https://... EVOLUTION_API_KEY=...
   ```

Pronto. Daqui em diante, ninguém precisa mexer no servidor para conectar um número novo.

### 7.4 Conectar o WhatsApp (cada pessoa, sozinha)

No site, em **Agentes › Assistente no WhatsApp**:

- **No computador:** escolha o perfil e clique em **Gerar QR Code**. No celular, abra o WhatsApp › **Configurações** › **Aparelhos conectados** › **Conectar aparelho** e aponte a câmera.
- **No próprio celular:** escolha **Código**, digite o seu número com 55 e DDD e clique em **Gerar código**. Toque na notificação do WhatsApp (ou vá em **Aparelhos conectados › Conectar aparelho › Conectar com número de telefone**) e digite o código.

A tela muda sozinha para **Conectado**, e o assistente manda uma mensagem de boas-vindas na conversa **"Você"** (a conversa com você mesmo). A partir daí, é só mandar ali os gastos e recebimentos: mensagem, foto ou PDF do comprovante, ou áudio. O assistente responde na mesma conversa, com 🤖, e **desfazer** apaga o último lançamento.

Cada pessoa usa o próprio número. O assistente só responde na conversa "Você": as outras conversas chegam ao servidor, mas são descartadas sem ser guardadas. Para desligar, use **Desconectar** no site ou remova o aparelho "Controle Financeiro" em **Aparelhos conectados**.

### 7.5 Testes

```bash
npx deno@2.9.6 test --allow-env supabase/functions/_testes/agentes.test.ts
```

### 7.6 Manutenção do servidor

- **Ver se está no ar:** `sudo docker compose -f cfi/servidor/evolution/docker-compose.yml ps`
- **Reiniciar:** `sudo docker compose -f cfi/servidor/evolution/docker-compose.yml restart`
- **Atualizar a Evolution:** troque a versão em `docker-compose.yml` e rode `up -d`. Antes de ir para a 2.4, leia as notas da versão: ela passou a exigir ativação de licença.
- A Oracle pode desligar máquinas *Always Free* paradas por muito tempo. Com o WhatsApp conectado, a máquina fica em uso e isso não deve acontecer.

## Para vender no futuro

A base já separa os dados de cada cliente por espaço. Ainda falta:

- **Pagamento:** trocar a tabela `allowed_creators` pela confirmação de compra.
- **Planos:** usar `plan` e `max_members` (`individual` com 1 conta, `conjunto` com 2).
- **Personalização:** hoje os nomes, as categorias e os cartões estão em `assets/data.js`, iguais para todos. Cada cliente precisará cadastrar os próprios.
- **Exigências legais:** termos de uso, política de privacidade e adequação à LGPD.
