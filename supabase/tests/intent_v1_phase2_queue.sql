\set ON_ERROR_STOP on

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
  not has_function_privilege(
    'authenticated',
    'public.intent_claim_jobs(text[],uuid,integer,integer)',
    'execute'
  ),
  'browser roles cannot claim queue jobs'
);

rollback;
