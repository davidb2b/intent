-- A user can run multiple independent researches. Only one is active at a
-- time, preventing a new keyword from inheriting posts, comments or costs
-- collected for an earlier keyword.
alter table public.projetos add column if not exists ativo boolean not null default true;

alter table public.projetos drop constraint if exists projetos_owner_id_key;

create unique index if not exists projetos_one_active_per_owner_idx
  on public.projetos (owner_id)
  where ativo;
