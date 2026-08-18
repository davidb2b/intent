-- Intent v1 foundation.
--
-- This migration is deliberately additive: legacy data and flows remain intact
-- while the people-first engine receives its own contracts, private storage,
-- queue and credit ledger.

create or replace function public.intent_owns_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.projetos projeto
    where projeto.id = target_project_id
      and projeto.owner_id = auth.uid()
  );
$$;

revoke all on function public.intent_owns_project(uuid) from public, anon;
grant execute on function public.intent_owns_project(uuid) to authenticated, service_role;

alter table public.projetos
  add column if not exists intent_people_first boolean not null default false,
  add column if not exists onboarding_status text not null default 'nao_iniciado',
  add column if not exists creditos_mensais integer not null default 5000;

alter table public.projetos
  drop constraint if exists projetos_onboarding_status_check,
  add constraint projetos_onboarding_status_check
    check (onboarding_status in ('nao_iniciado', 'em_andamento', 'concluido', 'falhou')),
  drop constraint if exists projetos_creditos_mensais_check,
  add constraint projetos_creditos_mensais_check check (creditos_mensais >= 0);

alter table public.fontes
  add column if not exists tipo_watchlist text;

alter table public.fontes
  drop constraint if exists fontes_tipo_watchlist_check,
  add constraint fontes_tipo_watchlist_check
    check (tipo_watchlist is null or tipo_watchlist in ('pagina', 'pessoa'));

alter table public.pessoas
  add column if not exists status text,
  add column if not exists intencao smallint,
  add column if not exists ultimo_sinal_em timestamptz,
  add column if not exists email_disponivel boolean not null default false,
  add column if not exists telefone_disponivel boolean not null default false;

alter table public.pessoas
  drop constraint if exists pessoas_status_check,
  add constraint pessoas_status_check
    check (status is null or status in ('vigiado', 'lead', 'sinal_fraco', 'cliente', 'fora_icp')),
  drop constraint if exists pessoas_intencao_check,
  add constraint pessoas_intencao_check
    check (intencao is null or intencao between 0 and 100);

alter table public.empresas
  add column if not exists nivel text,
  add column if not exists pessoas_com_sinal integer not null default 0;

alter table public.empresas
  drop constraint if exists empresas_nivel_check,
  add constraint empresas_nivel_check
    check (nivel is null or nivel in ('em_movimento', 'aquecendo', 'fria')),
  drop constraint if exists empresas_pessoas_com_sinal_check,
  add constraint empresas_pessoas_com_sinal_check check (pessoas_com_sinal >= 0);

alter table public.execucoes drop constraint if exists execucoes_tipo_check;
alter table public.execucoes add constraint execucoes_tipo_check
  check (tipo in (
    'descoberta',
    'monitoramento',
    'onboarding',
    'semente',
    'vigilia',
    'julgamento',
    'cascata',
    'enriquecimento'
  ));

alter table public.execucoes drop constraint if exists execucoes_status_check;
alter table public.execucoes add constraint execucoes_status_check
  check (status in (
    'rodando',
    'concluida',
    'falhou',
    'abortada_por_custo',
    'parcial',
    'aguardando_creditos'
  ));

alter table public.custos
  add column if not exists provider text,
  add column if not exists operacao text,
  add column if not exists external_run_id text,
  add column if not exists latencia_ms integer,
  add column if not exists completude numeric;

alter table public.custos
  drop constraint if exists custos_latencia_ms_check,
  add constraint custos_latencia_ms_check
    check (latencia_ms is null or latencia_ms >= 0),
  drop constraint if exists custos_completude_check,
  add constraint custos_completude_check
    check (completude is null or completude between 0 and 1);

create table public.icps (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  versao integer not null check (versao > 0),
  status text not null default 'rascunho'
    check (status in ('rascunho', 'ativo', 'arquivado')),
  empresa_resumo text not null,
  firmografia jsonb not null default '{}'::jsonb
    check (jsonb_typeof(firmografia) = 'object'),
  comprador jsonb not null default '{}'::jsonb
    check (jsonb_typeof(comprador) = 'object'),
  sinais_de_compra jsonb not null default '{}'::jsonb
    check (jsonb_typeof(sinais_de_compra) = 'object'),
  modelo_geracao text not null,
  prompt_versao text not null,
  custo_usd numeric not null default 0 check (custo_usd >= 0),
  criado_em timestamptz not null default now(),
  ativado_em timestamptz,
  unique (projeto_id, versao)
);

create unique index icps_one_active_per_project_idx
  on public.icps (projeto_id)
  where status = 'ativo';

create table public.sinais (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  empresa_id uuid references public.empresas(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  icp_id uuid not null references public.icps(id) on delete restrict,
  tipo text not null check (tipo in (
    'comentou_tema',
    'pediu_indicacao',
    'mudou_cargo',
    'engajou_concorrente',
    'engajou_influenciador',
    'compartilhou_tema',
    'atividade_fraca'
  )),
  urn_unico text not null,
  evidencia text not null check (char_length(btrim(evidencia)) > 0),
  contexto text,
  nota smallint not null check (nota between 0 and 100),
  regra_que_bateu text not null,
  ocorrido_em timestamptz not null,
  capturado_em timestamptz not null default now(),
  unique (projeto_id, urn_unico)
);

create index sinais_project_person_recent_idx
  on public.sinais (projeto_id, pessoa_id, ocorrido_em desc);
create index sinais_project_company_recent_idx
  on public.sinais (projeto_id, empresa_id, ocorrido_em desc)
  where empresa_id is not null;

create table public.sinal_julgamentos_privados (
  sinal_id uuid primary key references public.sinais(id) on delete cascade,
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  resposta jsonb not null check (jsonb_typeof(resposta) = 'object'),
  modelo text not null,
  prompt_versao text not null,
  custo_usd numeric not null default 0 check (custo_usd >= 0),
  latencia_ms integer check (latencia_ms is null or latencia_ms >= 0),
  criado_em timestamptz not null default now()
);

create table public.pessoa_operacao_privada (
  pessoa_id uuid primary key references public.pessoas(id) on delete cascade,
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  origem text not null check (origem in (
    'semente_apollo',
    'cascata_empresa',
    'cascata_post',
    'cascata_autor'
  )),
  fit smallint check (fit is null or fit between 0 and 100),
  apollo_id text,
  localizacao_status text not null default 'pendente'
    check (localizacao_status in ('pendente', 'brasil_confirmado', 'fora_brasil')),
  pais_literal text,
  localizacao_evidencia jsonb,
  verificado_em timestamptz,
  ultima_verificacao_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index pessoa_operacao_project_apollo_idx
  on public.pessoa_operacao_privada (projeto_id, apollo_id)
  where apollo_id is not null;
create index pessoa_operacao_pending_location_idx
  on public.pessoa_operacao_privada (projeto_id, criado_em)
  where localizacao_status = 'pendente';

create table public.pessoa_contatos_privados (
  pessoa_id uuid primary key references public.pessoas(id) on delete cascade,
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  email_ciphertext text,
  telefone_ciphertext text,
  provider text,
  provider_reference text,
  provider_metadata jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (email_ciphertext is not null or telefone_ciphertext is not null)
);

create table public.contatos_revelados (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  revelado_para uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('email', 'telefone')),
  referencia_credito text not null,
  revelado_em timestamptz not null default now(),
  unique (projeto_id, pessoa_id, revelado_para, tipo),
  unique (projeto_id, referencia_credito)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  tipo text not null check (tipo in (
    'gerar_icp',
    'semear_radar',
    'vigiar_pessoa',
    'julgar_sinal',
    'varrer_post',
    'varrer_empresa',
    'investigar_autor',
    'varrer_watchlist',
    'revelar_contato'
  )),
  status text not null default 'pendente' check (status in (
    'pendente',
    'rodando',
    'concluido',
    'falhou',
    'aguardando_creditos'
  )),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  payload_hash text not null,
  prioridade smallint not null default 100,
  tentativas smallint not null default 0 check (tentativas >= 0),
  max_tentativas smallint not null default 3 check (max_tentativas > 0),
  executar_apos timestamptz not null default now(),
  lease_ate timestamptz,
  lease_token uuid,
  ultimo_erro text,
  creditos_reservados integer not null default 0 check (creditos_reservados >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  concluido_em timestamptz,
  check (tentativas <= max_tentativas)
);

create unique index jobs_one_active_payload_idx
  on public.jobs (projeto_id, tipo, payload_hash)
  where status in ('pendente', 'rodando', 'aguardando_creditos');
create index jobs_claim_idx
  on public.jobs (status, executar_apos, prioridade, criado_em)
  where status = 'pendente';

create table public.contas_credito (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  competencia date not null,
  limite integer not null check (limite >= 0),
  reservado integer not null default 0 check (reservado >= 0),
  consumido integer not null default 0 check (consumido >= 0),
  versao integer not null default 0 check (versao >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (projeto_id, competencia),
  check (reservado + consumido <= limite)
);

create table public.creditos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  conta_id uuid not null references public.contas_credito(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  evento text not null check (evento in (
    'onboarding',
    'pessoa_julgada',
    'email_revelado',
    'telefone_revelado',
    'verificacao_sem_sinal',
    'concessao_mensal'
  )),
  movimento text not null check (movimento in ('reserva', 'consumo', 'estorno', 'concessao')),
  quantidade integer not null check (quantidade >= 0),
  referencia text not null,
  metadata jsonb,
  criado_em timestamptz not null default now(),
  unique (projeto_id, referencia, movimento)
);

create index creditos_project_recent_idx
  on public.creditos (projeto_id, criado_em desc);

create table public.integracao_raw_payloads (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  provider text not null,
  operacao text not null,
  external_run_id text,
  request_fingerprint text not null,
  payload jsonb not null,
  expira_em timestamptz not null,
  criado_em timestamptz not null default now(),
  unique (provider, operacao, request_fingerprint)
);

create index integracao_raw_payloads_expiration_idx
  on public.integracao_raw_payloads (expira_em);

alter table public.icps enable row level security;
alter table public.sinais enable row level security;
alter table public.sinal_julgamentos_privados enable row level security;
alter table public.pessoa_operacao_privada enable row level security;
alter table public.pessoa_contatos_privados enable row level security;
alter table public.contatos_revelados enable row level security;
alter table public.jobs enable row level security;
alter table public.contas_credito enable row level security;
alter table public.creditos enable row level security;
alter table public.integracao_raw_payloads enable row level security;

create policy "owners read icps" on public.icps
  for select to authenticated
  using (public.intent_owns_project(projeto_id));

create policy "owners read visible signals" on public.sinais
  for select to authenticated
  using (
    public.intent_owns_project(projeto_id)
    and exists (
      select 1
      from public.pessoas pessoa
      where pessoa.id = pessoa_id
        and (pessoa.status is null or pessoa.status in ('lead', 'sinal_fraco', 'cliente', 'fora_icp'))
    )
  );

-- Replace the legacy all-actions policy with least-privilege client access.
-- Existing rows remain visible because their Intent status is NULL.
drop policy if exists "owners manage people" on public.pessoas;

create policy "owners read visible people" on public.pessoas
  for select to authenticated
  using (
    public.intent_owns_project(projeto_id)
    and (status is null or status in ('lead', 'sinal_fraco', 'cliente', 'fora_icp'))
  );

create policy "owners review visible people" on public.pessoas
  for update to authenticated
  using (
    public.intent_owns_project(projeto_id)
    and (status is null or status in ('lead', 'sinal_fraco', 'cliente', 'fora_icp'))
  )
  with check (
    public.intent_owns_project(projeto_id)
    and (status is null or status in ('lead', 'sinal_fraco', 'cliente', 'fora_icp'))
  );

-- Public/browser roles receive only the client-safe projection of people.
revoke all on public.pessoas from anon, authenticated;
grant select (
  id,
  projeto_id,
  empresa_id,
  linkedin_url,
  slug,
  nome,
  headline,
  cargo,
  senioridade,
  icp,
  icp_motivo,
  revisado_por_humano,
  criado_em,
  status,
  intencao,
  ultimo_sinal_em,
  email_disponivel,
  telefone_disponivel
) on public.pessoas to authenticated;
grant update (icp, icp_motivo, revisado_por_humano, status)
  on public.pessoas to authenticated;
grant all on public.pessoas to service_role;

-- Costs and every operational/private table are backend-only. Edge Functions
-- use service_role and therefore keep the current legacy collection working.
drop policy if exists "owners manage costs" on public.custos;
revoke all on public.custos from public, anon, authenticated;
grant all on public.custos to service_role;

revoke all on public.icps from public, anon, authenticated;
grant select on public.icps to authenticated;
grant all on public.icps to service_role;

revoke all on public.sinais from public, anon, authenticated;
grant select on public.sinais to authenticated;
grant all on public.sinais to service_role;

revoke all on public.sinal_julgamentos_privados from public, anon, authenticated;
revoke all on public.pessoa_operacao_privada from public, anon, authenticated;
revoke all on public.pessoa_contatos_privados from public, anon, authenticated;
revoke all on public.contatos_revelados from public, anon, authenticated;
revoke all on public.jobs from public, anon, authenticated;
revoke all on public.contas_credito from public, anon, authenticated;
revoke all on public.creditos from public, anon, authenticated;
revoke all on public.integracao_raw_payloads from public, anon, authenticated;

grant all on public.sinal_julgamentos_privados to service_role;
grant all on public.pessoa_operacao_privada to service_role;
grant all on public.pessoa_contatos_privados to service_role;
grant all on public.contatos_revelados to service_role;
grant all on public.jobs to service_role;
grant all on public.contas_credito to service_role;
grant all on public.creditos to service_role;
grant all on public.integracao_raw_payloads to service_role;

create index pessoas_project_status_intent_idx
  on public.pessoas (projeto_id, status, intencao desc)
  where status is not null;
create index empresas_project_level_idx
  on public.empresas (projeto_id, nivel)
  where nivel is not null;

comment on column public.projetos.intent_people_first is
  'Feature flag for the Intent v1 people-first engine.';
comment on column public.pessoas.status is
  'Intent status. NULL preserves legacy records; vigiado is backend-only.';
comment on table public.pessoa_operacao_privada is
  'Server-only fit, provider identity, provenance and literal Brazil validation.';
comment on table public.pessoa_contatos_privados is
  'Server-only encrypted contact material. Never return this table to the browser.';
comment on table public.integracao_raw_payloads is
  'Short-lived server-only provider payloads retained for audit and normalization.';
