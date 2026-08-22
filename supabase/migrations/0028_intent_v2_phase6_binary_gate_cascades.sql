create table if not exists public.intent_v2_portoes_pessoas_privados (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  icp_v2_id uuid not null references public.intent_v2_icps(id) on delete cascade,
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  origem text not null check (origem in ('semente', 'empresa', 'post', 'atividade')),
  aprovado boolean not null,
  brasil_confirmado boolean not null,
  excluido boolean not null,
  cargo_compativel boolean not null,
  motivo text not null check (motivo in ('aprovado', 'localizacao_nao_confirmada_no_brasil', 'perfil_excluido_pelo_icp', 'cargo_fora_do_perfil_ideal')),
  evidencia jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (projeto_id, icp_v2_id, pessoa_id)
);

create index if not exists intent_v2_portoes_pessoas_projeto_icp_idx
  on public.intent_v2_portoes_pessoas_privados (projeto_id, icp_v2_id, aprovado, atualizado_em desc);

create table if not exists public.intent_v2_expansoes_privadas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  icp_v2_id uuid not null references public.intent_v2_icps(id) on delete cascade,
  tipo text not null check (tipo in ('empresa', 'post')),
  referencia_chave text not null,
  origem_pessoa_id uuid references public.pessoas(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  status text not null default 'pendente' check (status in ('pendente', 'rodando', 'concluida', 'falhou')),
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  concluida_em timestamptz,
  unique (projeto_id, icp_v2_id, tipo, referencia_chave)
);

create index if not exists intent_v2_expansoes_projeto_icp_status_idx
  on public.intent_v2_expansoes_privadas (projeto_id, icp_v2_id, status, atualizado_em desc);

alter table public.intent_v2_portoes_pessoas_privados enable row level security;
alter table public.intent_v2_expansoes_privadas enable row level security;

drop policy if exists "intent_v2_gate_service_only" on public.intent_v2_portoes_pessoas_privados;
create policy "intent_v2_gate_service_only" on public.intent_v2_portoes_pessoas_privados
  for all to service_role using (true) with check (true);

drop policy if exists "intent_v2_expansion_service_only" on public.intent_v2_expansoes_privadas;
create policy "intent_v2_expansion_service_only" on public.intent_v2_expansoes_privadas
  for all to service_role using (true) with check (true);
