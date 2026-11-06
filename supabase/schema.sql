-- Controle Financeiro Integrado: banco de dados
-- Rode este arquivo inteiro uma vez no SQL Editor do Supabase.
--
-- Modelo: cada cliente é um "espaço" (workspace). Um espaço tem um plano e um
-- limite de contas: hoje, 2 contas para o casal. O plano individual futuro usa
-- a mesma estrutura com max_members = 1. Toda linha de dados pertence a um
-- espaço, e as regras abaixo impedem o acesso de quem não é membro dele.

-- ---------- Tabelas ----------

create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  plan        text not null default 'conjunto' check (plan in ('individual', 'conjunto')),
  max_members int  not null default 2 check (max_members >= 1),
  invite_code text not null unique
              default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  created_at  timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  email        text,
  display_name text,
  joined_at    timestamptz not null default now(),
  primary key (workspace_id, user_id),
  unique (user_id) -- por enquanto, cada conta participa de um único espaço
);

-- Quem pode abrir um espaço novo. Fica vazia até você adicionar seu e-mail.
-- Quando houver vendas, esta checagem é o ponto a trocar pela validação de compra.
create table public.allowed_creators (
  email text primary key check (email = lower(email))
);

create table public.entries (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  profile      text not null check (char_length(profile) between 1 and 40),
  kind         text not null check (kind in ('in', 'out')),
  cat          text not null check (char_length(cat) between 1 and 80),
  obs          text not null default '' check (char_length(obs) <= 80),
  val          numeric(14, 2) not null check (val > 0),
  forma        text not null check (char_length(forma) <= 40),
  tipo         text not null check (char_length(tipo) <= 40),
  card         text not null default '-' check (char_length(card) <= 40),
  parc         text not null default '1/1' check (char_length(parc) <= 10),
  venc         date not null,
  pag          date,
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz -- excluir só marca a data; permite desfazer e avisa o outro aparelho
);
create index entries_workspace_venc on public.entries (workspace_id, venc);

-- Metas por categoria, limites de cartão e metas da empresa.
create table public.targets (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  scope        text not null check (scope in ('meta', 'limite', 'empresa')),
  key          text not null check (char_length(key) between 1 and 140),
  value        numeric(14, 2) not null default 0 check (value >= 0),
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, scope, key)
);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger entries_touch before update on public.entries
  for each row execute function public.touch_updated_at();
create trigger targets_touch before update on public.targets
  for each row execute function public.touch_updated_at();

-- ---------- Regras de acesso ----------

create function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.allowed_creators  enable row level security;
alter table public.entries           enable row level security;
alter table public.targets           enable row level security;

create policy workspaces_read on public.workspaces
  for select to authenticated using (public.is_member(id));

create policy members_read on public.workspace_members
  for select to authenticated using (public.is_member(workspace_id));

create policy entries_read on public.entries
  for select to authenticated using (public.is_member(workspace_id));
create policy entries_insert on public.entries
  for insert to authenticated with check (public.is_member(workspace_id));
create policy entries_update on public.entries
  for update to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

create policy targets_read on public.targets
  for select to authenticated using (public.is_member(workspace_id));
create policy targets_insert on public.targets
  for insert to authenticated with check (public.is_member(workspace_id));
create policy targets_update on public.targets
  for update to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

-- O Supabase concede tudo por padrão; aqui fica só o que o site usa.
-- Espaços e membros só mudam pelas funções abaixo.
revoke all on public.workspaces, public.workspace_members, public.allowed_creators,
              public.entries, public.targets from anon, authenticated;
grant select on public.workspaces, public.workspace_members to authenticated;
grant select, insert, update on public.entries, public.targets to authenticated;

-- ---------- Funções chamadas pelo site ----------

create function public.criar_espaco(p_nome text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
  v_nome  text := auth.jwt() -> 'user_metadata' ->> 'full_name';
  v_ws    uuid;
begin
  if v_uid is null then raise exception 'nao_autenticado'; end if;
  if not exists (select 1 from public.allowed_creators a where a.email = v_email) then
    raise exception 'nao_autorizado';
  end if;
  if exists (select 1 from public.workspace_members m where m.user_id = v_uid) then
    raise exception 'ja_participa';
  end if;
  insert into public.workspaces (name) values (coalesce(nullif(trim(p_nome), ''), 'Conta conjunta'))
    returning id into v_ws;
  insert into public.workspace_members (workspace_id, user_id, role, email, display_name)
    values (v_ws, v_uid, 'owner', v_email, v_nome);
  return v_ws;
end $$;

create function public.entrar_com_convite(p_codigo text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_ws   public.workspaces%rowtype;
  v_qtde int;
begin
  if v_uid is null then raise exception 'nao_autenticado'; end if;
  if exists (select 1 from public.workspace_members m where m.user_id = v_uid) then
    raise exception 'ja_participa';
  end if;
  -- A trava evita que dois convites simultâneos passem do limite de contas.
  select * into v_ws from public.workspaces w
    where w.invite_code = upper(trim(p_codigo)) for update;
  if not found then raise exception 'convite_invalido'; end if;
  select count(*) into v_qtde from public.workspace_members m where m.workspace_id = v_ws.id;
  if v_qtde >= v_ws.max_members then raise exception 'espaco_cheio'; end if;
  insert into public.workspace_members (workspace_id, user_id, role, email, display_name)
    values (v_ws.id, v_uid, 'member', lower(auth.jwt() ->> 'email'),
            auth.jwt() -> 'user_metadata' ->> 'full_name');
  return v_ws.id;
end $$;

create function public.novo_convite(p_ws uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_codigo text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
begin
  if not exists (select 1 from public.workspace_members m
                 where m.workspace_id = p_ws and m.user_id = auth.uid() and m.role = 'owner') then
    raise exception 'nao_autorizado';
  end if;
  update public.workspaces set invite_code = v_codigo where id = p_ws;
  return v_codigo;
end $$;

create function public.apagar_dados(p_ws uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.workspace_members m
                 where m.workspace_id = p_ws and m.user_id = auth.uid() and m.role = 'owner') then
    raise exception 'nao_autorizado';
  end if;
  -- O update avisa o outro aparelho; o delete remove os dados de verdade.
  update public.entries set deleted_at = now() where workspace_id = p_ws and deleted_at is null;
  update public.targets set value = 0 where workspace_id = p_ws;
  delete from public.entries where workspace_id = p_ws;
  delete from public.targets where workspace_id = p_ws;
end $$;

revoke all on function public.is_member(uuid), public.criar_espaco(text),
  public.entrar_com_convite(text), public.novo_convite(uuid), public.apagar_dados(uuid)
  from public, anon;
grant execute on function public.is_member(uuid), public.criar_espaco(text),
  public.entrar_com_convite(text), public.novo_convite(uuid), public.apagar_dados(uuid)
  to authenticated;

-- ---------- Sincronização em tempo real ----------

alter publication supabase_realtime add table public.entries, public.targets;
