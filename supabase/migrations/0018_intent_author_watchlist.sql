-- Intent v1, Phase 2: private person-to-post evidence used by author suggestions.

create table public.post_engajadores_privados (
  post_id uuid not null references public.posts(id) on delete cascade,
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  icp_id uuid not null references public.icps(id) on delete cascade,
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  comentou boolean not null default false,
  reagiu boolean not null default false,
  primeiro_engajamento_em timestamptz,
  ultimo_engajamento_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (post_id, pessoa_id, icp_id),
  check (comentou or reagiu),
  check (
    primeiro_engajamento_em is null
    or ultimo_engajamento_em is null
    or primeiro_engajamento_em <= ultimo_engajamento_em
  )
);

create index post_engajadores_project_icp_person_idx
  on public.post_engajadores_privados (projeto_id, icp_id, pessoa_id);

alter table public.post_engajadores_privados enable row level security;
revoke all on public.post_engajadores_privados from public, anon, authenticated;
grant all on public.post_engajadores_privados to service_role;

insert into public.post_engajadores_privados (
  post_id,
  pessoa_id,
  icp_id,
  projeto_id,
  comentou,
  reagiu,
  primeiro_engajamento_em,
  ultimo_engajamento_em
)
select
  signal.post_id,
  signal.pessoa_id,
  signal.icp_id,
  signal.projeto_id,
  bool_or(signal.tipo = 'comentou_tema'),
  bool_or(signal.tipo = 'atividade_fraca'),
  min(signal.ocorrido_em),
  max(signal.ocorrido_em)
from public.sinais signal
where signal.post_id is not null
group by signal.post_id, signal.pessoa_id, signal.icp_id, signal.projeto_id
on conflict (post_id, pessoa_id, icp_id) do nothing;

comment on table public.post_engajadores_privados is
  'Server-only accepted ICP engagement links used to qualify author watchlist suggestions.';
