\set ON_ERROR_STOP on

begin;

create function public.intent_onboarding_test_assert(condition boolean, label text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if condition is distinct from true then
    raise exception 'Intent onboarding assertion failed: %', label;
  end if;
end;
$$;

insert into auth.users (id)
values ('10000000-0000-0000-0000-000000000001');

insert into public.projetos (
  id,
  owner_id,
  nome,
  categoria,
  creditos_mensais,
  site_url,
  site_dominio
) values (
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Empresa A',
  'Intent',
  20,
  'https://example.com',
  'example.com'
);

set local role service_role;

select public.intent_reserve_onboarding_credits(
  '00000000-0000-0000-0000-000000000001',
  'onboarding:execution-a',
  12
);

select public.intent_reserve_onboarding_credits(
  '00000000-0000-0000-0000-000000000001',
  'onboarding:execution-a',
  12
);

select public.intent_onboarding_test_assert(
  (select reservado = 12 and consumido = 0 from public.contas_credito where projeto_id = '00000000-0000-0000-0000-000000000001'),
  'an idempotent reservation changes the balance only once'
);

select public.intent_consume_onboarding_credits(
  '00000000-0000-0000-0000-000000000001',
  'onboarding:execution-a'
);

select public.intent_consume_onboarding_credits(
  '00000000-0000-0000-0000-000000000001',
  'onboarding:execution-a'
);

select public.intent_onboarding_test_assert(
  (select reservado = 0 and consumido = 12 from public.contas_credito where projeto_id = '00000000-0000-0000-0000-000000000001'),
  'consumption is idempotent and moves the reservation atomically'
);

reset role;

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
  prompt_versao
) values
  (
    '40000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    1,
    'rascunho',
    'Primeiro ICP',
    '{}'::jsonb,
    '{}'::jsonb,
    '{"temas":["Tema A","Tema B"]}'::jsonb,
    'gpt-test',
    'v1'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    2,
    'rascunho',
    'Segundo ICP',
    '{}'::jsonb,
    '{}'::jsonb,
    '{"temas":["Tema B","Tema C"]}'::jsonb,
    'gpt-test',
    'v1'
  );

set local role service_role;

select public.intent_activate_icp(
  '00000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001'
);

reset role;

select public.intent_onboarding_test_assert(
  (select status = 'ativo' from public.icps where id = '40000000-0000-0000-0000-000000000001'),
  'the selected draft becomes active'
);

set local role service_role;

select public.intent_activate_icp(
  '00000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000002'
);

reset role;

select public.intent_onboarding_test_assert(
  (select status = 'arquivado' from public.icps where id = '40000000-0000-0000-0000-000000000001'),
  'activating v2 archives v1 without deleting it'
);

select public.intent_onboarding_test_assert(
  (select status = 'ativo' from public.icps where id = '40000000-0000-0000-0000-000000000002'),
  'v2 becomes the only active version'
);

select public.intent_onboarding_test_assert(
  (select count(*) = 3 from public.termos where projeto_id = '00000000-0000-0000-0000-000000000001'),
  'activation seeds topics without duplicating existing ones'
);

select public.intent_onboarding_test_assert(
  (select count(*) = 2 from public.jobs where projeto_id = '00000000-0000-0000-0000-000000000001' and tipo = 'semear_radar'),
  'each ICP version receives one deduplicated Phase 2 seed job'
);

select public.intent_onboarding_test_assert(
  (select intent_people_first and onboarding_status = 'concluido' from public.projetos where id = '00000000-0000-0000-0000-000000000001'),
  'activation enables the people-first workspace'
);
rollback;
