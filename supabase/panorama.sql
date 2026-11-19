-- Controle Financeiro Integrado: Panorama de contas e contas fixas
-- Rode depois do schema.sql e do cfi-acesso.sql. Pode rodar de novo.
--
-- Panorama: um calendário por mês com cada conta no dia do vencimento.
--   * Lançamentos comuns aparecem na data de vencimento (venc).
--   * Compras no crédito se juntam na fatura do cartão, no dia em que a
--     fatura vence (dias de fechamento e vencimento ficam em "cartoes").
--   * Contas fixas (aluguel, internet, consórcio...) geram um lançamento por
--     mês, no dia certo, pelo prazo escolhido. Assim elas entram também nos
--     dashboards, nos relatórios e no CFO.
-- Situação de cada conta: Concluído (pago), Previsto ou Atrasado.

-- ---------- Lançamentos ----------

alter table public.entries
  -- Conta que não estava planejada, lançada direto no calendário.
  add column if not exists imprevisto boolean not null default false,
  -- Marcada à mão como atrasada (sem isso, atrasada = vencida e sem pagamento).
  add column if not exists atrasado   boolean not null default false,
  -- Lançamento gerado por uma conta fixa.
  add column if not exists conta_fixa_id uuid;

-- ---------- Contas fixas ----------

create table if not exists public.contas_fixas (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  profile      text not null check (char_length(profile) between 1 and 40),
  descricao    text not null check (char_length(descricao) between 1 and 80),
  cat          text not null check (char_length(cat) between 1 and 80),
  val          numeric(14, 2) not null check (val > 0),
  dia          int  not null check (dia between 1 and 31),
  inicio       date not null check (extract(day from inicio) = 1), -- primeiro mês
  meses        int  check (meses is null or meses between 1 and 600), -- vazio = sem prazo
  forma        text not null check (char_length(forma) between 1 and 40),
  card         text not null default '-' check (char_length(card) <= 40),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists contas_fixas_ws on public.contas_fixas (workspace_id);

do $$ begin
  alter table public.entries add constraint entries_conta_fixa_fk
    foreign key (conta_fixa_id) references public.contas_fixas (id) on delete set null;
exception when duplicate_object then null;
end $$;
create index if not exists entries_conta_fixa on public.entries (conta_fixa_id) where conta_fixa_id is not null;

-- ---------- Cartões e faturas ----------

-- Fechamento e vencimento de cada cartão de cada pessoa.
create table if not exists public.cartoes (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  profile      text not null check (char_length(profile) between 1 and 40),
  card         text not null check (char_length(card) between 1 and 40),
  bandeira     text not null default '' check (char_length(bandeira) <= 20),
  fechamento   int check (fechamento between 1 and 31),
  vencimento   int check (vencimento between 1 and 31),
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, profile, card)
);

-- Situação de cada fatura (cartão + dia do vencimento). Sem linha aqui, a
-- situação vem das datas. entry_ids guarda as compras confirmadas ao pagar,
-- para desfazer exatamente essas se a fatura voltar a ficar em aberto.
create table if not exists public.faturas (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  profile      text not null check (char_length(profile) between 1 and 40),
  card         text not null check (char_length(card) between 1 and 40),
  vencimento   date not null,
  situacao     text not null check (situacao in ('previsto', 'atrasado', 'concluido')),
  pago_em      date,
  entry_ids    uuid[] not null default '{}',
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, profile, card, vencimento)
);

drop trigger if exists contas_fixas_touch on public.contas_fixas;
create trigger contas_fixas_touch before update on public.contas_fixas
  for each row execute function public.touch_updated_at();
drop trigger if exists cartoes_touch on public.cartoes;
create trigger cartoes_touch before update on public.cartoes
  for each row execute function public.touch_updated_at();
drop trigger if exists faturas_touch on public.faturas;
create trigger faturas_touch before update on public.faturas
  for each row execute function public.touch_updated_at();

-- ---------- Regras de acesso: só quem é do CFI ----------

alter table public.contas_fixas enable row level security;
alter table public.cartoes      enable row level security;
alter table public.faturas      enable row level security;

drop policy if exists fixas_read on public.contas_fixas;
create policy fixas_read on public.contas_fixas
  for select to authenticated using (public.is_member(workspace_id));

drop policy if exists cartoes_read on public.cartoes;
drop policy if exists cartoes_insert on public.cartoes;
drop policy if exists cartoes_update on public.cartoes;
create policy cartoes_read on public.cartoes
  for select to authenticated using (public.is_member(workspace_id));
create policy cartoes_insert on public.cartoes
  for insert to authenticated with check (public.is_member(workspace_id));
create policy cartoes_update on public.cartoes
  for update to authenticated using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

drop policy if exists faturas_read on public.faturas;
drop policy if exists faturas_insert on public.faturas;
drop policy if exists faturas_update on public.faturas;
create policy faturas_read on public.faturas
  for select to authenticated using (public.is_member(workspace_id));
create policy faturas_insert on public.faturas
  for insert to authenticated with check (public.is_member(workspace_id));
create policy faturas_update on public.faturas
  for update to authenticated using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

revoke all on public.contas_fixas, public.cartoes, public.faturas from anon, authenticated;
-- Contas fixas só mudam pelas funções abaixo, que também ajustam os lançamentos.
grant select on public.contas_fixas to authenticated;
grant select, insert, update on public.cartoes, public.faturas to authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on public.contas_fixas, public.cartoes, public.faturas to service_role;
  end if;
end $$;

-- ---------- Funções das contas fixas ----------

-- Dia do vencimento no mês (31 em fevereiro cai no último dia).
create or replace function public.dia_no_mes(p_mes date, p_dia int) returns date
language sql immutable set search_path = '' as $$
  select (date_trunc('month', p_mes)::date
          + (least(p_dia, extract(day from (date_trunc('month', p_mes) + interval '1 month - 1 day'))::int) - 1));
$$;

-- Cria os lançamentos que faltam: um por mês, do início até o fim do prazo
-- (sem prazo: até dezembro do ano que vem). Um mês que já teve lançamento,
-- mesmo excluído depois, não é recriado.
create or replace function public.gerar_contas_fixas(p_ws uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_cf  public.contas_fixas%rowtype;
  v_ate date := make_date(extract(year from current_date)::int + 1, 12, 1);
  v_mes date;
  v_i   int;
  v_n   int := 0;
begin
  if not public.is_member(p_ws) then raise exception 'nao_autorizado'; end if;
  -- Dois aparelhos ao mesmo tempo não duplicam nada.
  perform pg_advisory_xact_lock(hashtext('contas_fixas:' || p_ws::text));
  for v_cf in select * from public.contas_fixas where workspace_id = p_ws loop
    v_i := 0;
    v_mes := v_cf.inicio;
    while (v_cf.meses is null or v_i < v_cf.meses) and v_mes <= v_ate loop
      if not exists (select 1 from public.entries e
                      where e.conta_fixa_id = v_cf.id and date_trunc('month', e.venc) = v_mes) then
        insert into public.entries (workspace_id, profile, kind, cat, obs, val, forma, tipo, card, parc, venc, pag, conta_fixa_id, created_by)
        values (p_ws, v_cf.profile, 'out', v_cf.cat, v_cf.descricao, v_cf.val, v_cf.forma, 'Recorrente', v_cf.card,
                case when v_cf.meses is null then 'Fixa' else (v_i + 1) || '/' || v_cf.meses end,
                public.dia_no_mes(v_mes, v_cf.dia), null, v_cf.id, auth.uid());
        v_n := v_n + 1;
      end if;
      v_i := v_i + 1;
      v_mes := (v_mes + interval '1 month')::date;
    end loop;
  end loop;
  return v_n;
end $$;

-- Cria (p_id vazio) ou altera uma conta fixa. Ao alterar, os lançamentos em
-- aberto passam a seguir a conta (valor, dia, categoria, pagamento); os já
-- pagos ficam como estão. Lançamentos em aberto fora do novo prazo são excluídos.
create or replace function public.salvar_conta_fixa(
  p_id uuid, p_ws uuid, p_profile text, p_descricao text, p_cat text, p_val numeric,
  p_dia int, p_inicio date, p_meses int, p_forma text, p_card text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id     uuid := p_id;
  v_inicio date := date_trunc('month', p_inicio)::date;
  v_fim    date;
begin
  if not public.is_member(p_ws) then raise exception 'nao_autorizado'; end if;
  if nullif(trim(p_descricao), '') is null then raise exception 'descricao_obrigatoria'; end if;
  if p_val is null or p_val <= 0 then raise exception 'valor_invalido'; end if;
  if p_dia is null or p_dia not between 1 and 31 then raise exception 'dia_invalido'; end if;
  if p_meses is not null and p_meses not between 1 and 600 then raise exception 'prazo_invalido'; end if;

  if v_id is null then
    insert into public.contas_fixas (workspace_id, profile, descricao, cat, val, dia, inicio, meses, forma, card)
    values (p_ws, p_profile, trim(p_descricao), p_cat, p_val, p_dia, v_inicio, p_meses, p_forma, coalesce(nullif(p_card, ''), '-'))
    returning id into v_id;
  else
    update public.contas_fixas set profile = p_profile, descricao = trim(p_descricao), cat = p_cat, val = p_val,
      dia = p_dia, inicio = v_inicio, meses = p_meses, forma = p_forma, card = coalesce(nullif(p_card, ''), '-')
    where id = v_id and workspace_id = p_ws;
    if not found then raise exception 'nao_encontrada'; end if;

    v_fim := case when p_meses is null then null else (v_inicio + make_interval(months => p_meses))::date end;
    -- Em aberto fora do prazo novo: sai.
    update public.entries e set deleted_at = now()
     where e.conta_fixa_id = v_id and e.pag is null and e.deleted_at is null
       and (e.venc < v_inicio or (v_fim is not null and e.venc >= v_fim));
    -- Em aberto dentro do prazo: segue a conta.
    update public.entries e set
      profile = p_profile, cat = p_cat, obs = trim(p_descricao), val = p_val, forma = p_forma,
      card = coalesce(nullif(p_card, ''), '-'),
      venc = public.dia_no_mes(e.venc, p_dia),
      parc = case when p_meses is null then 'Fixa'
                  else ((extract(year from age(date_trunc('month', e.venc), v_inicio)) * 12
                         + extract(month from age(date_trunc('month', e.venc), v_inicio)))::int + 1) || '/' || p_meses end
     where e.conta_fixa_id = v_id and e.pag is null and e.deleted_at is null;
  end if;
  perform public.gerar_contas_fixas(p_ws);
  return v_id;
end $$;

-- Exclui a conta fixa e os lançamentos dela ainda em aberto a partir deste mês.
-- O que já foi pago, e os meses passados, ficam no histórico.
create or replace function public.excluir_conta_fixa(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_ws uuid;
begin
  select workspace_id into v_ws from public.contas_fixas where id = p_id;
  if v_ws is null or not public.is_member(v_ws) then raise exception 'nao_autorizado'; end if;
  update public.entries set deleted_at = now()
   where conta_fixa_id = p_id and pag is null and deleted_at is null
     and venc >= date_trunc('month', current_date)::date;
  delete from public.contas_fixas where id = p_id;
end $$;

revoke all on function public.gerar_contas_fixas(uuid),
  public.salvar_conta_fixa(uuid, uuid, text, text, text, numeric, int, date, int, text, text),
  public.excluir_conta_fixa(uuid) from public, anon;
grant execute on function public.gerar_contas_fixas(uuid),
  public.salvar_conta_fixa(uuid, uuid, text, text, text, numeric, int, date, int, text, text),
  public.excluir_conta_fixa(uuid) to authenticated;

-- ---------- Tempo real ----------

do $$ begin
  alter publication supabase_realtime add table public.contas_fixas, public.cartoes, public.faturas;
exception when duplicate_object then null;
end $$;

-- "Apagar todos os meus dados" também apaga contas fixas, cartões e faturas.
create or replace function public.apagar_dados(p_ws uuid) returns void
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
  delete from public.contas_fixas where workspace_id = p_ws;
  delete from public.faturas where workspace_id = p_ws;
  delete from public.cartoes where workspace_id = p_ws;
end $$;
