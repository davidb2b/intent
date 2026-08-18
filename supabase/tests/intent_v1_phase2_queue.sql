begin;

create function public.intent_phase2_assert(condition boolean, label text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if condition is distinct from true then
    raise exception 'Intent v1 phase 2 assertion failed: %', label;
  end if;
end;
$$;

revoke all on function public.intent_phase2_assert(boolean, text) from public;
grant execute on function public.intent_phase2_assert(boolean, text) to service_role;

insert into auth.users (id)
values ('12000000-0000-0000-0000-000000000001');

insert into public.projetos (
  id,
  owner_id,
  nome,
  categoria,
  ativo,
  intent_people_first,
  onboarding_status,
  creditos_mensais
) values (
  '02000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000001',
  'Phase 2 queue',
  'Teste',
  true,
  true,
  'concluido',
  3
);

insert into public.icps (
  id,
  projeto_id,
  versao,
  status,
  empresa_resumo,
  firmografia,
  comprador,
  sinais_de_compra,
  modelo_geracao,
  prompt_versao,
  ativado_em
) values (
  '42000000-0000-0000-0000-000000000001',
  '02000000-0000-0000-0000-000000000001',
  1,
  'ativo',
  'Empresa de teste',
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  'test',
  'test.v1',
  now()
);

insert into public.fontes (
  id,
  projeto_id,
  tipo,
  tipo_watchlist,
  linkedin_url,
  nome,
  status
) values (
  '32000000-0000-0000-0000-000000000001',
  '02000000-0000-0000-0000-000000000001',
  'perfil',
  'pessoa',
  'https://www.linkedin.com/in/pessoa-watchlist',
  'Pessoa Watchlist',
  'candidata'
);

update public.fontes
   set status = 'monitorada'
 where id = '32000000-0000-0000-0000-000000000001';

select public.intent_phase2_assert(
  (
    select count(*) = 1
      from public.jobs
     where projeto_id = '02000000-0000-0000-0000-000000000001'
       and tipo = 'varrer_watchlist'
       and status = 'pendente'
       and payload ->> 'fonte_id' = '32000000-0000-0000-0000-000000000001'
       and payload ->> 'icp_id' = '42000000-0000-0000-0000-000000000001'
  ),
  'approving a Watchlist queues its first sweep'
);

select public.intent_phase2_assert(
  (
    select status = 'pendente' and ultimo_job_id is not null
      from public.watchlist_operacao_privada
     where fonte_id = '32000000-0000-0000-0000-000000000001'
  ),
  'the private Watchlist state records the queued sweep'
);

set local role service_role;

select public.intent_enqueue_watchlist_source(
  '32000000-0000-0000-0000-000000000001',
  'duplicate-test'
);

select public.intent_phase2_assert(
  (
    select count(*) = 1
      from public.jobs
     where projeto_id = '02000000-0000-0000-0000-000000000001'
       and tipo = 'varrer_watchlist'
       and status in ('pendente', 'rodando', 'aguardando_creditos')
       and payload ->> 'fonte_id' = '32000000-0000-0000-0000-000000000001'
  ),
  'an approved Watchlist cannot accumulate overlapping sweeps'
);

reset role;

insert into public.fontes (
  id,
  projeto_id,
  tipo,
  linkedin_url,
  nome,
  status
) values (
  '32000000-0000-0000-0000-000000000002',
  '02000000-0000-0000-0000-000000000001',
  'perfil',
  'https://www.linkedin.com/in/fonte-legada',
  'Fonte legada',
  'monitorada'
);

select public.intent_phase2_assert(
  public.intent_enqueue_watchlist_source(
    '32000000-0000-0000-0000-000000000002',
    'legacy-test'
  ) is null,
  'legacy monitored sources never enter the V1 Watchlist engine'
);

set local role service_role;

select public.intent_phase2_assert(
  public.intent_enqueue_job(
    '02000000-0000-0000-0000-000000000001',
    'julgar_sinal',
    '{"candidate_id":"52000000-0000-0000-0000-000000000001"}'::jsonb,
    20::smallint,
    3::smallint
  ) = public.intent_enqueue_job(
    '02000000-0000-0000-0000-000000000001',
    'julgar_sinal',
    '{"candidate_id":"52000000-0000-0000-0000-000000000001"}'::jsonb,
    20::smallint,
    3::smallint
  ),
  'an active payload is enqueued only once'
);

create temporary table phase2_claimed as
select *
from public.intent_claim_jobs(
  array['julgar_sinal'],
  '02000000-0000-0000-0000-000000000001',
  1,
  120
);

select public.intent_phase2_assert(
  (select count(*) = 1 from phase2_claimed),
  'one pending job is claimed'
);

select public.intent_phase2_assert(
  not exists (
    select 1
    from public.intent_claim_jobs(
      array['julgar_sinal'],
      '02000000-0000-0000-0000-000000000001',
      1,
      120
    )
  ),
  'an active lease cannot be claimed twice'
);

select public.intent_phase2_assert(
  public.intent_reserve_job_credits(
    (select id from phase2_claimed),
    'pessoa_julgada',
    1,
    'phase2-test:person-1'
  ),
  'one product credit is reserved atomically'
);

select public.intent_phase2_assert(
  (
    select limite = 3 and reservado = 1 and consumido = 0
    from public.contas_credito
    where projeto_id = '02000000-0000-0000-0000-000000000001'
  ),
  'the account reflects the reservation before consumption'
);

select public.intent_phase2_assert(
  public.intent_settle_job_credits(
    (select id from phase2_claimed),
    'phase2-test:person-1',
    true
  ),
  'the reservation can be settled as consumption'
);

select public.intent_phase2_assert(
  (
    select limite = 3 and reservado = 0 and consumido = 1
    from public.contas_credito
    where projeto_id = '02000000-0000-0000-0000-000000000001'
  ),
  'settlement moves the same credit from reserved to consumed'
);

select public.intent_phase2_assert(
  (
    select count(*) = 2
      and count(*) filter (where movimento = 'reserva') = 1
      and count(*) filter (where movimento = 'consumo') = 1
    from public.creditos
    where projeto_id = '02000000-0000-0000-0000-000000000001'
      and referencia = 'phase2-test:person-1'
  ),
  'the immutable ledger contains one reservation and one consumption'
);

select public.intent_phase2_assert(
  public.intent_complete_job(
    (select id from phase2_claimed),
    (select lease_token from phase2_claimed)
  ),
  'only the current lease can complete the job'
);

select public.intent_phase2_assert(
  (select status = 'concluido' from public.jobs where id = (select id from phase2_claimed)),
  'the queue records a completed terminal state'
);

select public.intent_enqueue_job(
  '02000000-0000-0000-0000-000000000001',
  'varrer_empresa',
  '{"empresa_id":"62000000-0000-0000-0000-000000000001","icp_id":"42000000-0000-0000-0000-000000000001"}'::jsonb,
  30::smallint,
  3::smallint
) as id
into temporary table phase2_company_job;

create temporary table phase2_company_claimed as
select *
from public.intent_claim_jobs(
  array['varrer_empresa'],
  '02000000-0000-0000-0000-000000000001',
  1,
  120
);

select public.intent_phase2_assert(
  public.intent_complete_job(
    (select id from phase2_company_claimed),
    (select lease_token from phase2_company_claimed)
  ),
  'the company expansion can complete with its lease'
);

select public.intent_phase2_assert(
  public.intent_enqueue_job(
    '02000000-0000-0000-0000-000000000001',
    'varrer_empresa',
    '{"empresa_id":"62000000-0000-0000-0000-000000000001","icp_id":"42000000-0000-0000-0000-000000000001"}'::jsonb,
    30::smallint,
    3::smallint
  ) = (select id from phase2_company_job),
  'a completed company cascade is not re-enqueued for the same ICP'
);

select public.intent_enqueue_job(
  '02000000-0000-0000-0000-000000000001',
  'varrer_post',
  '{"post_id":"72000000-0000-0000-0000-000000000001","icp_id":"42000000-0000-0000-0000-000000000001"}'::jsonb,
  35::smallint,
  3::smallint
) as id
into temporary table phase2_post_job;

create temporary table phase2_post_claimed as
select *
from public.intent_claim_jobs(
  array['varrer_post'],
  '02000000-0000-0000-0000-000000000001',
  1,
  120
);

select public.intent_phase2_assert(
  public.intent_complete_job(
    (select id from phase2_post_claimed),
    (select lease_token from phase2_post_claimed)
  ),
  'the post expansion can complete with its lease'
);

select public.intent_phase2_assert(
  public.intent_enqueue_job(
    '02000000-0000-0000-0000-000000000001',
    'varrer_post',
    '{"post_id":"72000000-0000-0000-0000-000000000001","icp_id":"42000000-0000-0000-0000-000000000001"}'::jsonb,
    35::smallint,
    3::smallint
  ) = (select id from phase2_post_job),
  'a completed post cascade is not re-enqueued for the same ICP'
);

update public.projetos
   set orcamento_diario_perfis = 1
 where id = '02000000-0000-0000-0000-000000000001';

select public.intent_enqueue_job(
  '02000000-0000-0000-0000-000000000001',
  'vigiar_pessoa',
  '{"pessoa_id":"82000000-0000-0000-0000-000000000001","icp_id":"42000000-0000-0000-0000-000000000001"}'::jsonb,
  40::smallint,
  3::smallint
);

create temporary table phase2_budget_claimed as
select *
from public.intent_claim_jobs(
  array['vigiar_pessoa'],
  '02000000-0000-0000-0000-000000000001',
  1,
  120
);

select public.intent_phase2_assert(
  public.intent_reserve_engine_budget(
    (select id from phase2_budget_claimed),
    (select tentativas from phase2_budget_claimed),
    1
  ) = 'reservado',
  'one engine unit is reserved for the active attempt'
);

select public.intent_phase2_assert(
  public.intent_reserve_engine_budget(
    (select id from phase2_budget_claimed),
    (select tentativas from phase2_budget_claimed),
    1
  ) = 'reservado',
  'repeating the same attempt does not consume the budget twice'
);

select public.intent_phase2_assert(
  (
    select budget.consumido = 1 and count(reservation.job_id) = 1
      from public.orcamentos_motor_diarios budget
      left join public.orcamento_motor_reservas reservation
        on reservation.projeto_id = budget.projeto_id and reservation.dia = budget.dia
     where budget.projeto_id = '02000000-0000-0000-0000-000000000001'
     group by budget.consumido
  ),
  'daily budget and attempt ledger remain consistent'
);

select public.intent_phase2_assert(
  public.intent_complete_job(
    (select id from phase2_budget_claimed),
    (select lease_token from phase2_budget_claimed)
  ),
  'the budgeted job completes normally'
);

select public.intent_enqueue_job(
  '02000000-0000-0000-0000-000000000001',
  'vigiar_pessoa',
  '{"pessoa_id":"82000000-0000-0000-0000-000000000002","icp_id":"42000000-0000-0000-0000-000000000001"}'::jsonb,
  40::smallint,
  3::smallint
);

create temporary table phase2_daily_limit_claimed as
select *
from public.intent_claim_jobs(
  array['vigiar_pessoa'],
  '02000000-0000-0000-0000-000000000001',
  1,
  120
);

select public.intent_phase2_assert(
  public.intent_reserve_engine_budget(
    (select id from phase2_daily_limit_claimed),
    (select tentativas from phase2_daily_limit_claimed),
    1
  ) = 'aguardando_orcamento',
  'the next job waits without spending when the daily budget is full'
);

select public.intent_phase2_assert(
  (
    select status = 'pendente' and lease_token is null and executar_apos > now()
      from public.jobs
     where id = (select id from phase2_daily_limit_claimed)
  ),
  'a daily-limited job remains queued for the next cycle'
);

update public.contas_credito
   set consumido = limite, reservado = 0
 where projeto_id = '02000000-0000-0000-0000-000000000001';

select public.intent_enqueue_job(
  '02000000-0000-0000-0000-000000000001',
  'varrer_empresa',
  '{"empresa_id":"62000000-0000-0000-0000-000000000002","icp_id":"42000000-0000-0000-0000-000000000001"}'::jsonb,
  30::smallint,
  3::smallint
);

create temporary table phase2_no_credit_claimed as
select *
from public.intent_claim_jobs(
  array['varrer_empresa'],
  '02000000-0000-0000-0000-000000000001',
  1,
  120
);

select public.intent_phase2_assert(
  public.intent_reserve_engine_budget(
    (select id from phase2_no_credit_claimed),
    (select tentativas from phase2_no_credit_claimed),
    5
  ) = 'aguardando_creditos',
  'external work pauses before provider calls when product credits end'
);

select public.intent_phase2_assert(
  (select status = 'aguardando_creditos' from public.jobs where id = (select id from phase2_no_credit_claimed)),
  'the no-credit job remains recoverable'
);

update public.projetos
   set creditos_mensais = 4
 where id = '02000000-0000-0000-0000-000000000001';

select public.intent_phase2_assert(
  public.intent_resume_waiting_credit_jobs('02000000-0000-0000-0000-000000000001') = 1,
  'waiting jobs resume after credits become available'
);

select public.intent_phase2_assert(
  (select status = 'pendente' from public.jobs where id = (select id from phase2_no_credit_claimed)),
  'the resumed job returns to the queue'
);

reset role;

select public.intent_phase2_assert(
  not has_table_privilege('authenticated', 'public.sinais_candidatos_privados', 'select'),
  'candidate evidence remains server-only'
);

select public.intent_phase2_assert(
  not has_table_privilege('authenticated', 'public.pessoa_operacao_privada', 'select'),
  'radar and fit remain server-only'
);

select public.intent_phase2_assert(
  not has_table_privilege('authenticated', 'public.empresa_operacao_privada', 'select'),
  'company provider identity remains server-only'
);

select public.intent_phase2_assert(
  not has_table_privilege('authenticated', 'public.post_operacao_privada', 'select'),
  'qualified-post expansion remains server-only'
);

select public.intent_phase2_assert(
  not has_table_privilege('authenticated', 'public.orcamentos_motor_diarios', 'select')
  and not has_table_privilege('authenticated', 'public.orcamento_motor_reservas', 'select'),
  'engine budget and attempt ledger remain server-only'
);

select public.intent_phase2_assert(
  not has_table_privilege('authenticated', 'public.post_engajadores_privados', 'select'),
  'accepted post-engager relationships remain server-only'
);

select public.intent_phase2_assert(
  not has_function_privilege(
    'authenticated',
    'public.intent_reserve_engine_budget(uuid,smallint,integer)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.intent_resume_waiting_credit_jobs(uuid)',
    'execute'
  ),
  'browser roles cannot reserve or resume engine capacity'
);

select public.intent_phase2_assert(
  not has_function_privilege(
    'authenticated',
    'public.intent_claim_jobs(text[],uuid,integer,integer)',
    'execute'
  ),
  'browser roles cannot claim queue jobs'
);

rollback;
