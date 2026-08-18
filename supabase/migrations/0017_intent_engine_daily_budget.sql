-- Intent v1, Phase 2: atomic daily engine budget and product-credit preflight.

alter table public.projetos
  add column if not exists orcamento_diario_perfis integer not null default 160;

alter table public.projetos
  drop constraint if exists projetos_orcamento_diario_perfis_check,
  add constraint projetos_orcamento_diario_perfis_check
    check (orcamento_diario_perfis between 1 and 10000);

create table public.orcamentos_motor_diarios (
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  dia date not null,
  limite integer not null check (limite > 0),
  consumido integer not null default 0 check (consumido >= 0),
  atualizado_em timestamptz not null default now(),
  primary key (projeto_id, dia),
  check (consumido <= limite)
);

create table public.orcamento_motor_reservas (
  job_id uuid not null references public.jobs(id) on delete cascade,
  tentativa smallint not null check (tentativa > 0),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  dia date not null,
  unidades integer not null check (unidades > 0),
  criado_em timestamptz not null default now(),
  primary key (job_id, tentativa)
);

create index orcamento_motor_reservas_project_day_idx
  on public.orcamento_motor_reservas (projeto_id, dia);

alter table public.orcamentos_motor_diarios enable row level security;
alter table public.orcamento_motor_reservas enable row level security;
revoke all on public.orcamentos_motor_diarios from public, anon, authenticated;
revoke all on public.orcamento_motor_reservas from public, anon, authenticated;
grant all on public.orcamentos_motor_diarios to service_role;
grant all on public.orcamento_motor_reservas to service_role;

create or replace function public.intent_reserve_engine_budget(
  target_job_id uuid,
  target_attempt smallint,
  target_units integer
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_job public.jobs%rowtype;
  current_day date := timezone('America/Sao_Paulo', now())::date;
  next_day timestamptz := (
    date_trunc('day', timezone('America/Sao_Paulo', now())) + interval '1 day'
  ) at time zone 'America/Sao_Paulo';
  project_monthly_credits integer;
  project_daily_limit integer;
  current_competence date := date_trunc('month', timezone('America/Sao_Paulo', now()))::date;
  credit_account public.contas_credito%rowtype;
  daily_budget public.orcamentos_motor_diarios%rowtype;
begin
  if target_units <= 0 or target_attempt <= 0 then
    raise exception using errcode = '22023', message = 'Reserva de orçamento inválida.';
  end if;

  select * into target_job
    from public.jobs
   where id = target_job_id
   for update;

  if target_job.id is null then
    raise exception using errcode = 'P0002', message = 'Job não encontrado.';
  end if;
  if target_job.status <> 'rodando' or target_job.tentativas <> target_attempt then
    raise exception using errcode = '55000', message = 'O job não possui uma tentativa ativa compatível.';
  end if;

  if exists (
    select 1
      from public.orcamento_motor_reservas
     where job_id = target_job_id and tentativa = target_attempt
  ) then
    return 'reservado';
  end if;

  select creditos_mensais, orcamento_diario_perfis
    into project_monthly_credits, project_daily_limit
    from public.projetos
   where id = target_job.projeto_id;

  if project_monthly_credits is null then
    raise exception using errcode = 'P0002', message = 'Projeto não encontrado.';
  end if;

  insert into public.contas_credito (projeto_id, competencia, limite)
  values (target_job.projeto_id, current_competence, project_monthly_credits)
  on conflict (projeto_id, competencia) do update
    set limite = greatest(
      public.contas_credito.reservado + public.contas_credito.consumido,
      excluded.limite
    ),
    atualizado_em = now();

  select * into credit_account
    from public.contas_credito
   where projeto_id = target_job.projeto_id and competencia = current_competence
   for update;

  if credit_account.limite - credit_account.reservado - credit_account.consumido <= 0 then
    update public.jobs
       set status = 'aguardando_creditos',
           lease_ate = null,
           lease_token = null,
           ultimo_erro = 'Aguardando renovação de créditos.',
           atualizado_em = now()
     where id = target_job_id;
    return 'aguardando_creditos';
  end if;

  insert into public.orcamentos_motor_diarios (projeto_id, dia, limite)
  values (target_job.projeto_id, current_day, project_daily_limit)
  on conflict (projeto_id, dia) do update
    set limite = greatest(public.orcamentos_motor_diarios.consumido, excluded.limite),
        atualizado_em = now();

  select * into daily_budget
    from public.orcamentos_motor_diarios
   where projeto_id = target_job.projeto_id and dia = current_day
   for update;

  if daily_budget.consumido + target_units > daily_budget.limite then
    update public.jobs
       set status = 'pendente',
           executar_apos = next_day,
           lease_ate = null,
           lease_token = null,
           ultimo_erro = 'Orçamento diário concluído. A atividade será retomada no próximo ciclo.',
           atualizado_em = now()
     where id = target_job_id;
    return 'aguardando_orcamento';
  end if;

  update public.orcamentos_motor_diarios
     set consumido = consumido + target_units,
         atualizado_em = now()
   where projeto_id = target_job.projeto_id and dia = current_day;

  insert into public.orcamento_motor_reservas (
    job_id, tentativa, projeto_id, dia, unidades
  ) values (
    target_job_id, target_attempt, target_job.projeto_id, current_day, target_units
  );

  return 'reservado';
end;
$$;

create or replace function public.intent_resume_waiting_credit_jobs(
  target_project_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  resumed integer;
  current_competence date := date_trunc('month', timezone('America/Sao_Paulo', now()))::date;
begin
  with eligible_projects as (
    select project.id
      from public.projetos project
      left join public.contas_credito account
        on account.projeto_id = project.id
       and account.competencia = current_competence
     where (target_project_id is null or project.id = target_project_id)
       and project.creditos_mensais > coalesce(account.reservado + account.consumido, 0)
  )
  update public.jobs job
     set status = 'pendente',
         executar_apos = now(),
         ultimo_erro = null,
         atualizado_em = now()
   where job.status = 'aguardando_creditos'
     and job.projeto_id in (select id from eligible_projects);

  get diagnostics resumed = row_count;
  return resumed;
end;
$$;

revoke all on function public.intent_reserve_engine_budget(uuid, smallint, integer) from public, anon, authenticated;
revoke all on function public.intent_resume_waiting_credit_jobs(uuid) from public, anon, authenticated;
grant execute on function public.intent_reserve_engine_budget(uuid, smallint, integer) to service_role;
grant execute on function public.intent_resume_waiting_credit_jobs(uuid) to service_role;

comment on table public.orcamentos_motor_diarios is
  'Server-only daily ceiling for people evaluated by the Intent engine.';
comment on table public.orcamento_motor_reservas is
  'Immutable server-only budget reservation per job attempt.';
