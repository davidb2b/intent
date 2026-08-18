-- Intent v1, Phase 2: private and idempotent expansion of qualified posts.

create table public.post_operacao_privada (
  post_id uuid not null references public.posts(id) on delete cascade,
  icp_id uuid not null references public.icps(id) on delete cascade,
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  expansao_status text not null default 'pendente'
    check (expansao_status in ('pendente', 'rodando', 'concluida', 'falhou')),
  comentarios_lidos integer not null default 0 check (comentarios_lidos >= 0),
  reacoes_lidas integer not null default 0 check (reacoes_lidas >= 0),
  pessoas_avaliadas integer not null default 0 check (pessoas_avaliadas >= 0),
  pessoas_aceitas integer not null default 0 check (pessoas_aceitas >= 0),
  pessoas_novas integer not null default 0 check (pessoas_novas >= 0),
  fontes jsonb not null default '[]'::jsonb check (jsonb_typeof(fontes) = 'array'),
  expandido_em timestamptz,
  ultimo_erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (post_id, icp_id)
);

create index post_operacao_project_status_idx
  on public.post_operacao_privada (projeto_id, expansao_status, atualizado_em);

alter table public.post_operacao_privada enable row level security;
revoke all on public.post_operacao_privada from public, anon, authenticated;
grant all on public.post_operacao_privada to service_role;

comment on table public.post_operacao_privada is
  'Server-only state, provider provenance and aggregate counts for qualified-post expansion.';
