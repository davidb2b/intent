-- Only explicit V1 Watchlist entries can enter the recurring engine. Legacy
-- monitored sources have no tipo_watchlist and must remain outside this flow.

create or replace function public.intent_enqueue_watchlist_source(
  target_source_id uuid,
  target_cycle text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  source_row public.fontes%rowtype;
  active_icp_id uuid;
  active_job_id uuid;
  queued_job_id uuid;
begin
  select source.* into source_row
    from public.fontes source
    join public.projetos project on project.id = source.projeto_id
   where source.id = target_source_id
     and source.status = 'monitorada'
     and source.tipo_watchlist in ('pagina', 'pessoa')
     and project.ativo = true;

  if source_row.id is null then
    return null;
  end if;

  select icp.id into active_icp_id
    from public.icps icp
   where icp.projeto_id = source_row.projeto_id
     and icp.status = 'ativo'
   order by icp.ativado_em desc nulls last, icp.criado_em desc
   limit 1;

  if active_icp_id is null then
    return null;
  end if;

  select job.id into active_job_id
    from public.jobs job
   where job.projeto_id = source_row.projeto_id
     and job.tipo = 'varrer_watchlist'
     and job.status in ('pendente', 'rodando', 'aguardando_creditos')
     and job.payload ->> 'fonte_id' = source_row.id::text
   order by job.criado_em desc
   limit 1;

  if active_job_id is not null then
    return active_job_id;
  end if;

  queued_job_id := public.intent_enqueue_job(
    source_row.projeto_id,
    'varrer_watchlist',
    jsonb_build_object(
      'fonte_id', source_row.id,
      'icp_id', active_icp_id,
      'janela', 'week',
      'ciclo', left(coalesce(nullif(btrim(target_cycle), ''), 'manual'), 100)
    ),
    45::smallint,
    3::smallint
  );

  insert into public.watchlist_operacao_privada (
    fonte_id, projeto_id, icp_id, status, ultimo_job_id,
    proxima_varredura_em, ultimo_erro, atualizado_em
  ) values (
    source_row.id, source_row.projeto_id, active_icp_id, 'pendente', queued_job_id,
    now(), null, now()
  )
  on conflict (fonte_id) do update
    set icp_id = excluded.icp_id,
        status = 'pendente',
        ultimo_job_id = excluded.ultimo_job_id,
        proxima_varredura_em = now(),
        ultimo_erro = null,
        atualizado_em = now();

  return queued_job_id;
end;
$$;

create or replace function public.intent_enqueue_due_watchlists()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  source_record record;
  queued integer := 0;
  cycle_key text := to_char(timezone('UTC', date_trunc('hour', now())), 'YYYY-MM-DD"T"HH24');
begin
  for source_record in
    select source.id
      from public.fontes source
      join public.projetos project on project.id = source.projeto_id and project.ativo = true
      join public.icps icp on icp.projeto_id = source.projeto_id and icp.status = 'ativo'
      left join public.watchlist_operacao_privada operation on operation.fonte_id = source.id
     where source.status = 'monitorada'
       and source.tipo_watchlist in ('pagina', 'pessoa')
       and (operation.fonte_id is null or operation.proxima_varredura_em <= now())
       and not exists (
         select 1
           from public.jobs job
          where job.projeto_id = source.projeto_id
            and job.tipo = 'varrer_watchlist'
            and job.status in ('pendente', 'rodando', 'aguardando_creditos')
            and job.payload ->> 'fonte_id' = source.id::text
       )
     order by coalesce(operation.proxima_varredura_em, source.criado_em), source.criado_em
  loop
    if public.intent_enqueue_watchlist_source(source_record.id, 'recorrente:' || cycle_key) is not null then
      queued := queued + 1;
    end if;
  end loop;

  return queued;
end;
$$;

revoke all on function public.intent_enqueue_watchlist_source(uuid, text) from public, anon, authenticated;
revoke all on function public.intent_enqueue_due_watchlists() from public, anon, authenticated;
grant execute on function public.intent_enqueue_watchlist_source(uuid, text) to service_role;
grant execute on function public.intent_enqueue_due_watchlists() to service_role;
