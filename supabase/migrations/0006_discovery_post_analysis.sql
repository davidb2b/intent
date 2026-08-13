-- A curadoria de resultados da busca usa a mesma análise explicável dos
-- posts monitorados, mas permanece em sua própria tabela para não antecipar
-- uma coleta de comentários antes de a fonte ser aprovada.
alter table public.posts_descobertos
  add column if not exists analise_topico text,
  add column if not exists analise_problema text,
  add column if not exists analise_motivo text,
  add column if not exists analise_coleta text;
