-- Intent v2 — Fase 1: contrato de domínio e isolamento de dados.
--
-- Esta migration é aditiva. O domínio v1 permanece intacto; o v2 começa em
-- uma tabela própria para evitar que score, status e payloads se misturem.
-- A ativação do v2 continua sendo uma decisão posterior do fluxo de produto.

create table public.intent_v2_icps (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  versao integer not null check (versao > 0),
  status text not null default 'rascunho'
    check (status in ('rascunho', 'ativo', 'arquivado')),
  site_url text not null
    check (site_url ~* '^https?://[^[:space:]]+$'),
  empresa_linkedin_url text
    check (empresa_linkedin_url is null or empresa_linkedin_url ~* '^https?://[^[:space:]]+$'),
  localizacoes text[] not null default array['Brasil']::text[]
    check (cardinality(localizacoes) > 0 and 'Brasil' = any(localizacoes)),
  empresa jsonb not null default '{}'::jsonb
    check (jsonb_typeof(empresa) = 'object'),
  comprador jsonb not null default '{}'::jsonb
    check (jsonb_typeof(comprador) = 'object'),
  sinais_de_compra jsonb not null default '{}'::jsonb
    check (jsonb_typeof(sinais_de_compra) = 'object'),
  execucao_origem_id uuid references public.execucoes(id) on delete set null,
  criado_por uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  ativado_em timestamptz,
  arquivado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  unique (projeto_id, versao)
);

comment on table public.intent_v2_icps is
  'Perfil ideal do Intent v2; fonte de verdade versionada, sem score numerico.';
comment on column public.intent_v2_icps.localizacoes is
  'Regiao autorizada do radar. Brasil e obrigatorio no v2.';
comment on column public.intent_v2_icps.empresa is
  'Firmografia e contexto sustentados por evidencia, sem valores inventados.';
comment on column public.intent_v2_icps.comprador is
  'Cargos, setores e portes confirmados para a busca.';
comment on column public.intent_v2_icps.sinais_de_compra is
  'Dores, gatilhos e termos curtos derivados do contexto real.';

create unique index intent_v2_icps_one_active_per_project_idx
  on public.intent_v2_icps (projeto_id)
  where status = 'ativo';

create index intent_v2_icps_project_status_idx
  on public.intent_v2_icps (projeto_id, status, versao desc);

alter table public.intent_v2_icps enable row level security;

create policy "owners manage intent v2 icps"
  on public.intent_v2_icps
  for all
  using (public.intent_owns_project(projeto_id))
  with check (public.intent_owns_project(projeto_id));

revoke all on table public.intent_v2_icps from anon;
grant select, insert, update, delete on table public.intent_v2_icps to authenticated;
grant all on table public.intent_v2_icps to service_role;
