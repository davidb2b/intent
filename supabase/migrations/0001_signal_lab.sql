create extension if not exists pgcrypto;

create table public.projetos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  categoria text not null,
  criado_em timestamptz not null default now(),
  unique (owner_id)
);

create table public.termos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  termo text not null,
  contexto_positivo text,
  contexto_negativo text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (projeto_id, termo)
);

create table public.fontes (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  tipo text not null check (tipo in ('perfil', 'pagina', 'post_avulso')),
  linkedin_url text not null,
  nome text,
  meta text,
  status text not null default 'candidata'
    check (status in ('monitorada', 'candidata', 'descartada')),
  descoberta_em text,
  criado_em timestamptz not null default now(),
  unique (projeto_id, linkedin_url)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  fonte_id uuid references public.fontes(id) on delete set null,
  linkedin_url text not null,
  post_urn text not null,
  autor_nome text,
  autor_url text,
  texto text,
  publicado_em timestamptz,
  total_reacoes int,
  total_comentarios int,
  total_shares int,
  analise_topico text,
  analise_problema text,
  analise_motivo text,
  analise_coleta text,
  status_curadoria text not null default 'pendente'
    check (status_curadoria in ('pendente', 'aprovado', 'descartado')),
  coletado_em timestamptz not null default now(),
  unique (projeto_id, post_urn)
);

create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  nome text not null,
  nome_chave text not null,
  linkedin_url text,
  setor text,
  porte text,
  icp boolean,
  icp_motivo text,
  criado_em timestamptz not null default now(),
  unique (projeto_id, nome_chave)
);

create table public.pessoas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  empresa_id uuid references public.empresas(id) on delete set null,
  linkedin_url text not null,
  slug text not null,
  nome text not null,
  headline text,
  cargo text,
  senioridade text check (senioridade in ('diretoria', 'gerencia', 'analista', 'fora')),
  icp boolean,
  icp_motivo text,
  revisado_por_humano boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (projeto_id, slug)
);

create table public.comentarios (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  comentario_urn text not null,
  texto text not null,
  publicado_em timestamptz,
  teor text check (teor in ('dor', 'pergunta', 'fornecedor', 'pratica', 'generico')),
  teor_confianca numeric,
  revisado_por_humano boolean not null default false,
  coletado_em timestamptz not null default now(),
  unique (projeto_id, comentario_urn)
);

create table public.execucoes (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  tipo text not null check (tipo in ('descoberta', 'monitoramento')),
  status text not null default 'rodando'
    check (status in ('rodando', 'concluida', 'falhou', 'abortada_por_custo')),
  parametros jsonb,
  posts_lidos int not null default 0,
  comentarios_lidos int not null default 0,
  pessoas_novas int not null default 0,
  custo_usd numeric not null default 0,
  erro text,
  iniciada_em timestamptz not null default now(),
  concluida_em timestamptz
);

create table public.custos (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.execucoes(id) on delete cascade,
  actor text not null,
  itens int not null,
  custo_usd numeric not null,
  criado_em timestamptz not null default now()
);

create index comentarios_projeto_pessoa_idx on public.comentarios (projeto_id, pessoa_id);
create index comentarios_projeto_post_idx on public.comentarios (projeto_id, post_id);
create index pessoas_projeto_empresa_idx on public.pessoas (projeto_id, empresa_id);
create index posts_projeto_fonte_idx on public.posts (projeto_id, fonte_id);
create index execucoes_projeto_iniciada_idx on public.execucoes (projeto_id, iniciada_em desc);

alter table public.projetos enable row level security;
alter table public.termos enable row level security;
alter table public.fontes enable row level security;
alter table public.posts enable row level security;
alter table public.empresas enable row level security;
alter table public.pessoas enable row level security;
alter table public.comentarios enable row level security;
alter table public.execucoes enable row level security;
alter table public.custos enable row level security;

create policy "owners manage projects" on public.projetos
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "owners manage terms" on public.termos
  for all using (exists (select 1 from public.projetos p where p.id = projeto_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projetos p where p.id = projeto_id and p.owner_id = auth.uid()));

create policy "owners manage sources" on public.fontes
  for all using (exists (select 1 from public.projetos p where p.id = projeto_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projetos p where p.id = projeto_id and p.owner_id = auth.uid()));

create policy "owners manage posts" on public.posts
  for all using (exists (select 1 from public.projetos p where p.id = projeto_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projetos p where p.id = projeto_id and p.owner_id = auth.uid()));

create policy "owners manage companies" on public.empresas
  for all using (exists (select 1 from public.projetos p where p.id = projeto_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projetos p where p.id = projeto_id and p.owner_id = auth.uid()));

create policy "owners manage people" on public.pessoas
  for all using (exists (select 1 from public.projetos p where p.id = projeto_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projetos p where p.id = projeto_id and p.owner_id = auth.uid()));

create policy "owners manage comments" on public.comentarios
  for all using (exists (select 1 from public.projetos p where p.id = projeto_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projetos p where p.id = projeto_id and p.owner_id = auth.uid()));

create policy "owners manage executions" on public.execucoes
  for all using (exists (select 1 from public.projetos p where p.id = projeto_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projetos p where p.id = projeto_id and p.owner_id = auth.uid()));

create policy "owners manage costs" on public.custos
  for all using (exists (select 1 from public.execucoes e join public.projetos p on p.id = e.projeto_id where e.id = execucao_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.execucoes e join public.projetos p on p.id = e.projeto_id where e.id = execucao_id and p.owner_id = auth.uid()));
