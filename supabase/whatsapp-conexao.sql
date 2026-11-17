-- Controle Financeiro Integrado: conexão do WhatsApp por QR Code (Evolution API)
-- Rode depois do agentes.sql. Pode rodar de novo sem problema.
--
-- Cada pessoa conecta o próprio WhatsApp pelo site, como um aparelho
-- conectado (igual ao WhatsApp Web). O agente lê e responde só a conversa
-- "Você" (mensagens para si mesmo); as outras conversas são ignoradas.

create table if not exists public.whatsapp_conexoes (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  profile      text not null check (char_length(profile) between 1 and 40),
  -- Nome da conexão no servidor da Evolution.
  instancia    text not null unique check (instancia ~ '^[a-z0-9-]{8,64}$'),
  -- Senha que o servidor da Evolution manda junto com cada aviso.
  segredo      text not null check (char_length(segredo) >= 32),
  estado       text not null default 'aguardando'
               check (estado in ('aguardando', 'conectado', 'desconectado')),
  phone        text check (phone ~ '^[0-9]{8,15}$'),
  -- Endereços da conversa "Você" (o WhatsApp pode usar mais de um).
  jids         text[] not null default '{}',
  atualizado   timestamptz not null default now()
);

alter table public.whatsapp_conexoes enable row level security;

-- Cada pessoa vê só a própria conexão. Quem muda é a função do servidor.
drop policy if exists conexoes_read on public.whatsapp_conexoes;
create policy conexoes_read on public.whatsapp_conexoes
  for select to authenticated using (user_id = auth.uid());

revoke all on public.whatsapp_conexoes from anon, authenticated;
-- O site lê só estas colunas; o segredo e os endereços ficam no servidor.
grant select (user_id, workspace_id, profile, estado, phone, atualizado)
  on public.whatsapp_conexoes to authenticated;
grant select, insert, update, delete on public.whatsapp_conexoes to service_role;
grant select, insert, update, delete on public.whatsapp_vinculos to service_role;
