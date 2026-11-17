-- Controle Financeiro Integrado: criar um CFI novo ou entrar em um existente
-- Rode depois do schema.sql (e do agentes.sql, se usar os agentes). Pode rodar de novo.
--
-- Cada CFI (um "espaço") guarda os próprios nomes: o titular, o(a) parceiro(a)
-- e a empresa. Nada disso fica no código do site, que é igual para todos.
--
-- Quem comprou (e-mail em allowed_creators) cria o CFI e escolhe:
--   conjunto   -> titular, parceiro(a), casal e empresa (2 contas)
--   individual -> titular e empresa (1 conta)
-- No conjunto, o titular informa o e-mail Google do(a) parceiro(a). Só esse
-- e-mail consegue pedir para entrar, e o titular precisa autorizar o pedido.

-- ---------- Nomes de cada CFI ----------

alter table public.workspaces
  add column if not exists nome_titular  text check (char_length(nome_titular)  between 1 and 40),
  add column if not exists nome_parceiro text check (char_length(nome_parceiro) between 1 and 40),
  add column if not exists email_parceiro text check (email_parceiro = lower(email_parceiro)),
  add column if not exists nome_empresa  text check (char_length(nome_empresa)  between 1 and 60),
  -- Categorias, cartões e contas próprias do CFI. Vazio = modelo padrão do site.
  add column if not exists estrutura     jsonb;

-- ---------- Pedidos de entrada ----------

create table if not exists public.pedidos_entrada (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  email        text not null,
  nome         text,
  -- Nome do titular, para quem pediu ver "aguardando Fulano autorizar"
  -- sem ter acesso a nenhum dado do CFI.
  nome_titular text,
  status       text not null default 'pendente' check (status in ('pendente', 'aceito', 'recusado', 'cancelado')),
  created_at   timestamptz not null default now(),
  respondido_at timestamptz
);
create unique index if not exists pedidos_um_pendente on public.pedidos_entrada (user_id) where status = 'pendente';
create index if not exists pedidos_ws on public.pedidos_entrada (workspace_id, status);

alter table public.pedidos_entrada enable row level security;

-- Quem pediu vê o próprio pedido; o titular vê os pedidos do próprio CFI.
drop policy if exists pedidos_read on public.pedidos_entrada;
create policy pedidos_read on public.pedidos_entrada
  for select to authenticated using (
    user_id = auth.uid() or exists (
      select 1 from public.workspace_members m
      where m.workspace_id = pedidos_entrada.workspace_id and m.user_id = auth.uid() and m.role = 'owner'));

revoke all on public.pedidos_entrada from anon, authenticated;
grant select on public.pedidos_entrada to authenticated;

-- ---------- Funções chamadas pelo site ----------

-- O código de convite deixa de valer: só entra quem o titular cadastrou e autorizou.
drop function if exists public.entrar_com_convite(text);
drop function if exists public.novo_convite(uuid);
drop function if exists public.criar_espaco(text);

create or replace function public.pode_criar_cfi() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.allowed_creators a where a.email = lower(auth.jwt() ->> 'email'));
$$;

-- Cria o CFI de quem comprou. Também completa os nomes de um CFI antigo,
-- criado antes desta tela existir, quando quem chama é o titular dele.
create or replace function public.configurar_cfi(
  p_tipo text, p_nome_titular text, p_nome_parceiro text, p_email_parceiro text, p_nome_empresa text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := auth.uid();
  v_email   text := lower(auth.jwt() ->> 'email');
  v_titular text := nullif(trim(p_nome_titular), '');
  v_parc    text := nullif(trim(p_nome_parceiro), '');
  v_mailp   text := lower(nullif(trim(p_email_parceiro), ''));
  v_emp     text := nullif(trim(p_nome_empresa), '');
  v_membro  public.workspace_members%rowtype;
  v_ws      uuid;
  v_qtde    int;
begin
  if v_uid is null then raise exception 'nao_autenticado'; end if;
  if p_tipo not in ('conjunto', 'individual') then raise exception 'tipo_invalido'; end if;
  if v_titular is null or v_emp is null then raise exception 'nomes_obrigatorios'; end if;
  if p_tipo = 'conjunto' then
    if v_parc is null or v_mailp is null then raise exception 'nomes_obrigatorios'; end if;
    if v_mailp !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido'; end if;
    if v_mailp = v_email then raise exception 'email_proprio'; end if;
  else
    v_parc := null; v_mailp := null;
  end if;

  select * into v_membro from public.workspace_members m where m.user_id = v_uid;
  if found then
    -- CFI antigo, sem nomes: só o titular completa.
    if v_membro.role <> 'owner' or exists (select 1 from public.workspaces w
        where w.id = v_membro.workspace_id and w.nome_titular is not null) then
      raise exception 'ja_participa';
    end if;
    select count(*) into v_qtde from public.workspace_members m where m.workspace_id = v_membro.workspace_id;
    if p_tipo = 'individual' and v_qtde > 1 then raise exception 'tem_parceiro'; end if;
    update public.workspaces set
      plan = p_tipo, max_members = case when p_tipo = 'conjunto' then 2 else 1 end,
      name = v_titular, nome_titular = v_titular, nome_parceiro = v_parc,
      email_parceiro = v_mailp, nome_empresa = v_emp
    where id = v_membro.workspace_id;
    return v_membro.workspace_id;
  end if;

  -- CFI novo: só para quem comprou.
  if not exists (select 1 from public.allowed_creators a where a.email = v_email) then
    raise exception 'nao_autorizado';
  end if;
  insert into public.workspaces (name, plan, max_members, nome_titular, nome_parceiro, email_parceiro, nome_empresa)
    values (v_titular, p_tipo, case when p_tipo = 'conjunto' then 2 else 1 end, v_titular, v_parc, v_mailp, v_emp)
    returning id into v_ws;
  insert into public.workspace_members (workspace_id, user_id, role, email, display_name)
    values (v_ws, v_uid, 'owner', v_email, v_titular);
  update public.pedidos_entrada set status = 'cancelado', respondido_at = now()
    where user_id = v_uid and status = 'pendente';
  return v_ws;
end $$;

-- O titular corrige o nome ou o e-mail do(a) parceiro(a) enquanto ele(a) ainda não entrou.
create or replace function public.trocar_parceiro(p_nome text, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ws    uuid;
  v_nome  text := nullif(trim(p_nome), '');
  v_email text := lower(nullif(trim(p_email), ''));
begin
  select m.workspace_id into v_ws from public.workspace_members m
    where m.user_id = auth.uid() and m.role = 'owner';
  if v_ws is null then raise exception 'nao_autorizado'; end if;
  if not exists (select 1 from public.workspaces w where w.id = v_ws and w.plan = 'conjunto') then
    raise exception 'nao_autorizado';
  end if;
  if (select count(*) from public.workspace_members m where m.workspace_id = v_ws) > 1 then
    raise exception 'parceiro_ja_entrou';
  end if;
  if v_nome is null or v_email is null then raise exception 'nomes_obrigatorios'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido'; end if;
  if v_email = lower(auth.jwt() ->> 'email') then raise exception 'email_proprio'; end if;
  update public.workspaces set nome_parceiro = v_nome, email_parceiro = v_email where id = v_ws;
  -- Pedido de quem não é mais o e-mail cadastrado deixa de valer.
  update public.pedidos_entrada set status = 'recusado', respondido_at = now()
    where workspace_id = v_ws and status = 'pendente' and email <> v_email;
end $$;

-- Encontra o CFI pelo e-mail de quem comprou. Só responde a quem foi
-- cadastrado como parceiro(a) desse CFI: para qualquer outra pessoa, o
-- e-mail "não existe", e ninguém descobre nomes digitando e-mails.
create or replace function public.procurar_cfi(p_email_titular text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_nome text;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  select w.nome_titular into v_nome
    from public.workspaces w
    join public.workspace_members m on m.workspace_id = w.id and m.role = 'owner'
   where m.email = lower(trim(p_email_titular))
     and w.plan = 'conjunto'
     and w.email_parceiro = lower(auth.jwt() ->> 'email');
  if v_nome is null then raise exception 'cfi_nao_encontrado'; end if;
  return v_nome;
end $$;

create or replace function public.pedir_entrada(p_email_titular text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
  v_ws    public.workspaces%rowtype;
begin
  if v_uid is null then raise exception 'nao_autenticado'; end if;
  if exists (select 1 from public.workspace_members m where m.user_id = v_uid) then
    raise exception 'ja_participa';
  end if;
  select w.* into v_ws
    from public.workspaces w
    join public.workspace_members m on m.workspace_id = w.id and m.role = 'owner'
   where m.email = lower(trim(p_email_titular))
     and w.plan = 'conjunto'
     and w.email_parceiro = v_email;
  if not found then raise exception 'cfi_nao_encontrado'; end if;
  if (select count(*) from public.workspace_members m where m.workspace_id = v_ws.id) >= v_ws.max_members then
    raise exception 'espaco_cheio';
  end if;
  update public.pedidos_entrada set status = 'cancelado', respondido_at = now()
    where user_id = v_uid and status = 'pendente';
  insert into public.pedidos_entrada (workspace_id, user_id, email, nome, nome_titular)
    values (v_ws.id, v_uid, v_email, auth.jwt() -> 'user_metadata' ->> 'full_name', v_ws.nome_titular);
end $$;

create or replace function public.cancelar_pedido() returns void
language sql security definer set search_path = '' as $$
  update public.pedidos_entrada set status = 'cancelado', respondido_at = now()
   where user_id = auth.uid() and status = 'pendente';
$$;

-- O titular confere o nome e o e-mail de quem pediu e autoriza ou recusa.
create or replace function public.responder_pedido(p_pedido uuid, p_aceitar boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_p  public.pedidos_entrada%rowtype;
  v_ws public.workspaces%rowtype;
begin
  -- A trava evita duas respostas ao mesmo tempo.
  select * into v_p from public.pedidos_entrada where id = p_pedido for update;
  if not found or not exists (select 1 from public.workspace_members m
      where m.workspace_id = v_p.workspace_id and m.user_id = auth.uid() and m.role = 'owner') then
    raise exception 'nao_autorizado';
  end if;
  if v_p.status <> 'pendente' then raise exception 'pedido_respondido'; end if;
  if not p_aceitar then
    update public.pedidos_entrada set status = 'recusado', respondido_at = now() where id = p_pedido;
    return;
  end if;
  select * into v_ws from public.workspaces where id = v_p.workspace_id for update;
  if v_ws.email_parceiro is distinct from v_p.email then raise exception 'pedido_respondido'; end if;
  if (select count(*) from public.workspace_members m where m.workspace_id = v_ws.id) >= v_ws.max_members then
    raise exception 'espaco_cheio';
  end if;
  if exists (select 1 from public.workspace_members m where m.user_id = v_p.user_id) then
    update public.pedidos_entrada set status = 'cancelado', respondido_at = now() where id = p_pedido;
    raise exception 'ja_participa';
  end if;
  insert into public.workspace_members (workspace_id, user_id, role, email, display_name)
    values (v_ws.id, v_p.user_id, 'member', v_p.email, v_ws.nome_parceiro);
  update public.pedidos_entrada set status = 'aceito', respondido_at = now() where id = p_pedido;
end $$;

revoke all on function public.pode_criar_cfi(), public.configurar_cfi(text, text, text, text, text),
  public.trocar_parceiro(text, text), public.procurar_cfi(text), public.pedir_entrada(text),
  public.cancelar_pedido(), public.responder_pedido(uuid, boolean) from public, anon;
grant execute on function public.pode_criar_cfi(), public.configurar_cfi(text, text, text, text, text),
  public.trocar_parceiro(text, text), public.procurar_cfi(text), public.pedir_entrada(text),
  public.cancelar_pedido(), public.responder_pedido(uuid, boolean) to authenticated;

-- O código de convite não aparece mais para ninguém.
revoke select on public.workspaces from authenticated;
grant select (id, name, plan, max_members, created_at, nome_titular, nome_parceiro,
              email_parceiro, nome_empresa, estrutura) on public.workspaces to authenticated;

-- Os agentes leem os nomes e a estrutura do CFI.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on public.workspaces to service_role;
  end if;
end $$;

-- O titular recebe o pedido na hora, e quem pediu vê a resposta na hora.
do $$ begin
  alter publication supabase_realtime add table public.pedidos_entrada;
exception when duplicate_object then null;
end $$;
