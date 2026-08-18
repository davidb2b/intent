\set ON_ERROR_STOP on

begin;

create function public.intent_test_assert(condition boolean, label text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if condition is distinct from true then
    raise exception 'Intent v1 migration assertion failed: %', label;
  end if;
end;
$$;

revoke all on function public.intent_test_assert(boolean, text) from public;
grant execute on function public.intent_test_assert(boolean, text)
  to authenticated, service_role;

insert into auth.users (id) values
  ('10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002');

insert into public.projetos (id, owner_id, nome, categoria, ativo) values
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Owner A', 'Teste A', true),
  ('00000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Owner B', 'Teste B', true);

insert into public.pessoas (
  id,
  projeto_id,
  linkedin_url,
  slug,
  nome,
  status,
  intencao
) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'https://linkedin.com/in/lead-a', 'lead-a', 'Lead A', 'lead', 91),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'https://linkedin.com/in/radar-a', 'radar-a', 'Radar A', 'vigiado', null),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'https://linkedin.com/in/lead-b', 'lead-b', 'Lead B', 'lead', 95),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'https://linkedin.com/in/legacy-a', 'legacy-a', 'Legacy A', null, null);

insert into public.pessoa_operacao_privada (
  pessoa_id,
  projeto_id,
  origem,
  fit,
  apollo_id,
  localizacao_status,
  pais_literal
) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'semente_apollo', 88, 'apollo-a', 'brasil_confirmado', 'Brazil'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'semente_apollo', 80, 'apollo-radar', 'brasil_confirmado', 'Brazil');

insert into public.pessoa_contatos_privados (
  pessoa_id,
  projeto_id,
  email_ciphertext
) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'cipher-email-a');

insert into public.icps (
  id,
  projeto_id,
  versao,
  status,
  empresa_resumo,
  modelo_geracao,
  prompt_versao
) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 1, 'ativo', 'ICP A', 'gpt-test', 'v1'),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 1, 'ativo', 'ICP B', 'gpt-test', 'v1');

insert into public.sinais (
  projeto_id,
  pessoa_id,
  icp_id,
  tipo,
  urn_unico,
  evidencia,
  nota,
  regra_que_bateu,
  ocorrido_em
) values
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'comentou_tema', 'urn:lead-a', 'Preciso resolver este problema.', 91, 'Dor declarada', now()),
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'atividade_fraca', 'urn:radar-a', 'Curtiu uma publicação.', 32, 'nenhuma', now()),
  ('00000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', 'comentou_tema', 'urn:lead-b', 'Outra evidência.', 95, 'Dor declarada', now());

insert into public.jobs (projeto_id, tipo, payload_hash) values
  ('00000000-0000-0000-0000-000000000001', 'vigiar_pessoa', 'job-a');

insert into public.execucoes (id, projeto_id, tipo, status) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'vigilia', 'concluida');

insert into public.custos (execucao_id, actor, itens, custo_usd) values
  ('50000000-0000-0000-0000-000000000001', 'actor-test', 1, 0.01);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

select public.intent_test_assert(
  (select count(*) = 2 from public.pessoas),
  'owner A sees its lead and legacy row; radar and owner B stay hidden'
);

select public.intent_test_assert(
  (select count(*) = 1 from public.sinais),
  'owner A sees only the signal attached to a visible person'
);

select public.intent_test_assert(
  (select count(*) = 1 from public.icps),
  'owner A sees only its own ICP'
);

select public.intent_test_assert(
  has_column_privilege(current_user, 'public.pessoas', 'intencao', 'SELECT'),
  'intent score is client-readable'
);

select public.intent_test_assert(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pessoas'
      and column_name in ('fit', 'origem', 'apollo_id')
  ),
  'operational fields are not stored in the client-visible people table'
);

select public.intent_test_assert(
  not has_table_privilege(current_user, 'public.pessoa_operacao_privada', 'SELECT'),
  'operational person data is server-only'
);

select public.intent_test_assert(
  not has_table_privilege(current_user, 'public.pessoa_contatos_privados', 'SELECT'),
  'private contacts are server-only'
);

select public.intent_test_assert(
  not has_table_privilege(current_user, 'public.jobs', 'SELECT'),
  'jobs are server-only'
);

select public.intent_test_assert(
  not has_table_privilege(current_user, 'public.integracao_raw_payloads', 'SELECT'),
  'raw provider payloads are server-only'
);

select public.intent_test_assert(
  not has_table_privilege(current_user, 'public.watchlist_operacao_privada', 'SELECT'),
  'recurring Watchlist operations are server-only'
);

select public.intent_test_assert(
  not has_table_privilege(current_user, 'public.custos', 'SELECT'),
  'provider costs are server-only'
);

update public.pessoas
set icp = true,
    icp_motivo = 'Aprovado na revisão',
    revisado_por_humano = true
where id = '30000000-0000-0000-0000-000000000001';

select public.intent_test_assert(
  (select revisado_por_humano from public.pessoas where id = '30000000-0000-0000-0000-000000000001'),
  'the explicit legacy review action remains available'
);

select public.intent_test_assert(
  not has_table_privilege(current_user, 'public.pessoas', 'INSERT'),
  'browser cannot insert ingestion data directly'
);

select public.intent_test_assert(
  not has_column_privilege(current_user, 'public.pessoas', 'status', 'UPDATE'),
  'browser cannot promote or demote a person directly'
);

reset role;
set local role service_role;

select public.intent_test_assert(
  (select count(*) = 2 from public.pessoa_operacao_privada),
  'service role can read private operational data'
);

select public.intent_test_assert(
  (select count(*) = 1 from public.custos),
  'service role keeps access to provider costs'
);

reset role;
rollback;
