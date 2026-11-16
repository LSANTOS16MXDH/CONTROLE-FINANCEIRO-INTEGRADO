-- Controle Financeiro Integrado: agentes (WhatsApp e CFO)
-- Rode este arquivo uma vez no SQL Editor do Supabase, depois do schema.sql.
--
-- As funções dos agentes rodam no servidor do Supabase (Edge Functions) com a
-- chave de serviço, que ignora as regras abaixo. Por isso, as tabelas usadas só
-- por elas ficam sem nenhuma permissão para o site.

-- De onde veio cada lançamento.
alter table public.entries
  add column origem text not null default 'site' check (origem in ('site', 'whatsapp'));

-- ---------- WhatsApp ----------

-- Número de WhatsApp de cada pessoa. O perfil é para onde vão os lançamentos
-- quando a mensagem não diz outro (casa ou empresa).
create table public.whatsapp_vinculos (
  phone        text primary key check (phone ~ '^[0-9]{8,15}$'),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  profile      text not null check (char_length(profile) between 1 and 40),
  created_at   timestamptz not null default now()
);

-- Código temporário que a pessoa gera no site e envia ao WhatsApp para vincular o número.
create table public.whatsapp_codigos (
  codigo       text primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  profile      text not null check (char_length(profile) between 1 and 40),
  expires_at   timestamptz not null default now() + interval '15 minutes'
);

-- Cada mensagem recebida, para não lançar duas vezes quando a Meta reenviar o
-- aviso e para saber o que apagar no "desfazer".
create table public.whatsapp_mensagens (
  message_id   text primary key,
  phone        text not null,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  entry_ids    uuid[] not null default '{}',
  status       text not null default 'recebida',
  created_at   timestamptz not null default now()
);
create index whatsapp_mensagens_phone on public.whatsapp_mensagens (phone, created_at desc);

-- ---------- CFO ----------

create table public.cfo_mensagens (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete set null,
  papel        text not null check (papel in ('user', 'cfo')),
  texto        text not null check (char_length(texto) between 1 and 20000),
  created_at   timestamptz not null default now()
);
create index cfo_mensagens_ws on public.cfo_mensagens (workspace_id, created_at);

-- ---------- Regras de acesso ----------

alter table public.whatsapp_vinculos  enable row level security;
alter table public.whatsapp_codigos   enable row level security;
alter table public.whatsapp_mensagens enable row level security;
alter table public.cfo_mensagens      enable row level security;

-- O site vê os números vinculados do espaço e pode desvincular só o próprio.
create policy vinculos_read on public.whatsapp_vinculos
  for select to authenticated using (public.is_member(workspace_id));
create policy vinculos_delete on public.whatsapp_vinculos
  for delete to authenticated using (user_id = auth.uid());

-- A conversa com o CFO é do espaço: as duas contas leem.
create policy cfo_read on public.cfo_mensagens
  for select to authenticated using (public.is_member(workspace_id));

revoke all on public.whatsapp_vinculos, public.whatsapp_codigos,
              public.whatsapp_mensagens, public.cfo_mensagens from anon, authenticated;
grant select, delete on public.whatsapp_vinculos to authenticated;
grant select on public.cfo_mensagens to authenticated;

-- As funções dos agentes usam a chave de servidor (service_role). Projetos
-- novos do Supabase não dão acesso às tabelas a esse papel por padrão.
grant select, insert, update, delete on public.whatsapp_vinculos, public.whatsapp_codigos,
      public.whatsapp_mensagens, public.cfo_mensagens to service_role;
grant select, insert, update on public.entries, public.workspace_members to service_role;
grant select on public.workspaces, public.targets to service_role;

-- ---------- Funções chamadas pelo site ----------

-- Gera o código de vínculo: 8 caracteres aleatórios, válido por 15 minutos.
create function public.gerar_codigo_whatsapp(p_profile text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_ws     uuid;
  v_codigo text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
begin
  select m.workspace_id into v_ws from public.workspace_members m where m.user_id = auth.uid();
  if v_ws is null then raise exception 'nao_autorizado'; end if;
  if p_profile is null or char_length(p_profile) not between 1 and 40 then raise exception 'perfil_invalido'; end if;
  delete from public.whatsapp_codigos c where c.user_id = auth.uid() or c.expires_at < now();
  insert into public.whatsapp_codigos (codigo, workspace_id, user_id, profile)
    values (v_codigo, v_ws, auth.uid(), p_profile);
  return v_codigo;
end $$;

-- Começa uma conversa nova com o CFO (apaga a anterior do espaço).
create function public.limpar_cfo(p_ws uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_member(p_ws) then raise exception 'nao_autorizado'; end if;
  delete from public.cfo_mensagens where workspace_id = p_ws;
end $$;

revoke all on function public.gerar_codigo_whatsapp(text), public.limpar_cfo(uuid) from public, anon;
grant execute on function public.gerar_codigo_whatsapp(text), public.limpar_cfo(uuid) to authenticated;

-- O site acompanha em tempo real a conversa do CFO e os números vinculados.
alter publication supabase_realtime add table public.cfo_mensagens, public.whatsapp_vinculos;
