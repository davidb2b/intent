\set ON_ERROR_STOP on

begin;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create schema phase0_rls_validation;

create table phase0_rls_validation.projetos (
  id uuid primary key,
  owner_id uuid not null
);

create table phase0_rls_validation.pessoas (
  id uuid primary key,
  projeto_id uuid not null references phase0_rls_validation.projetos(id),
  nome text not null,
  status text not null,
  intencao int,
  fit int,
  origem text,
  apollo_id text
);

create table phase0_rls_validation.pessoa_contatos_privados (
  pessoa_id uuid primary key references phase0_rls_validation.pessoas(id),
  email_ciphertext text,
  telefone_ciphertext text
);

create table phase0_rls_validation.jobs (id uuid primary key, projeto_id uuid not null);
create table phase0_rls_validation.integracao_raw_payloads (id uuid primary key, projeto_id uuid not null, payload jsonb not null);
create table phase0_rls_validation.custos (id uuid primary key, projeto_id uuid not null, custo_usd numeric not null);

alter table phase0_rls_validation.projetos enable row level security;
alter table phase0_rls_validation.pessoas enable row level security;
alter table phase0_rls_validation.pessoa_contatos_privados enable row level security;
alter table phase0_rls_validation.jobs enable row level security;
alter table phase0_rls_validation.integracao_raw_payloads enable row level security;
alter table phase0_rls_validation.custos enable row level security;

create policy owner_reads_project on phase0_rls_validation.projetos
  for select to authenticated
  using (owner_id = auth.uid());

create policy owner_reads_visible_people on phase0_rls_validation.pessoas
  for select to authenticated
  using (
    status in ('lead', 'sinal_fraco', 'cliente', 'fora_icp')
    and exists (
      select 1
      from phase0_rls_validation.projetos projeto
      where projeto.id = projeto_id and projeto.owner_id = auth.uid()
    )
  );

revoke all on schema phase0_rls_validation from public;
revoke all on all tables in schema phase0_rls_validation from public, anon, authenticated;
grant usage on schema auth, phase0_rls_validation to authenticated, service_role;
revoke all on function auth.uid() from public;
grant execute on function auth.uid() to authenticated, service_role;
grant select (id, owner_id) on phase0_rls_validation.projetos to authenticated;
grant select (id, projeto_id, nome, status, intencao) on phase0_rls_validation.pessoas to authenticated;
grant all on all tables in schema phase0_rls_validation to service_role;

create function phase0_rls_validation.assert_true(condition boolean, label text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, phase0_rls_validation
as $$
begin
  if condition is distinct from true then
    raise exception 'RLS assertion failed: %', label;
  end if;
end;
$$;
revoke all on function phase0_rls_validation.assert_true(boolean, text) from public;
grant execute on function phase0_rls_validation.assert_true(boolean, text) to authenticated, service_role;

insert into phase0_rls_validation.projetos values
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002');

insert into phase0_rls_validation.pessoas values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Lead A', 'lead', 91, 88, 'semente_apollo', 'apollo-a'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Radar A', 'vigiado', null, 80, 'semente_apollo', 'apollo-radar'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'Lead B', 'lead', 95, 90, 'cascata_post', 'apollo-b');

insert into phase0_rls_validation.pessoa_contatos_privados values
  ('30000000-0000-0000-0000-000000000001', 'cipher-email-a', 'cipher-phone-a'),
  ('30000000-0000-0000-0000-000000000003', 'cipher-email-b', 'cipher-phone-b');

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

select phase0_rls_validation.assert_true(
  (select count(*) = 1 from phase0_rls_validation.pessoas),
  'owner A sees only its visible person; radar and owner B stay hidden'
);
select phase0_rls_validation.assert_true(
  has_column_privilege(current_user, 'phase0_rls_validation.pessoas', 'intencao', 'SELECT'),
  'intent is client-readable'
);
select phase0_rls_validation.assert_true(
  not has_column_privilege(current_user, 'phase0_rls_validation.pessoas', 'fit', 'SELECT'),
  'fit is not client-readable'
);
select phase0_rls_validation.assert_true(
  not has_column_privilege(current_user, 'phase0_rls_validation.pessoas', 'apollo_id', 'SELECT'),
  'Apollo ID is not client-readable'
);
select phase0_rls_validation.assert_true(
  not has_table_privilege(current_user, 'phase0_rls_validation.pessoa_contatos_privados', 'SELECT'),
  'private contacts are server-only'
);
select phase0_rls_validation.assert_true(
  not has_table_privilege(current_user, 'phase0_rls_validation.jobs', 'SELECT'),
  'jobs are server-only'
);
select phase0_rls_validation.assert_true(
  not has_table_privilege(current_user, 'phase0_rls_validation.integracao_raw_payloads', 'SELECT'),
  'raw payloads are server-only'
);
select phase0_rls_validation.assert_true(
  not has_table_privilege(current_user, 'phase0_rls_validation.custos', 'SELECT'),
  'costs are server-only'
);

reset role;
set local role service_role;
select phase0_rls_validation.assert_true(
  (select count(*) = 2 from phase0_rls_validation.pessoa_contatos_privados),
  'service role can read operational private data'
);

reset role;
rollback;
