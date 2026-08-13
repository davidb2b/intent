-- Posts encontrados na descoberta não são posts monitorados. Esta tabela
-- preserva a prévia real para a UI sem misturar descoberta com sinais coletados.
create table public.posts_descobertos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  execucao_id uuid references public.execucoes(id) on delete set null,
  fonte_id uuid references public.fontes(id) on delete set null,
  post_urn text not null,
  linkedin_url text,
  autor_nome text not null,
  autor_url text not null,
  texto text not null,
  publicado_em timestamptz,
  total_reacoes int,
  total_comentarios int,
  total_shares int,
  relevancia numeric,
  status_curadoria text not null default 'pendente'
    check (status_curadoria in ('pendente', 'aprovado', 'descartado')),
  descoberto_em timestamptz not null default now(),
  unique (projeto_id, post_urn)
);

create index posts_descobertos_projeto_recente_idx
  on public.posts_descobertos (projeto_id, descoberto_em desc);

alter table public.posts_descobertos enable row level security;

create policy "owners manage discovered posts" on public.posts_descobertos
  for all using (exists (
    select 1 from public.projetos p
    where p.id = projeto_id and p.owner_id = auth.uid()
  )) with check (exists (
    select 1 from public.projetos p
    where p.id = projeto_id and p.owner_id = auth.uid()
  ));
