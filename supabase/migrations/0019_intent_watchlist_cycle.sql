-- Intent v1, Phase 2: approved Watchlists enter the people-first engine
-- immediately and are revisited once per day by the hourly scheduler.

create table public.watchlist_operacao_privada (
  fonte_id uuid primary key references public.fontes(id) on delete cascade,
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  icp_id uuid not null references public.icps(id) on delete cascade,
  status text not null default 'pendente' check (status in (
    'pendente', 'rodando', 'concluida', 'sem_novos_posts', 'falhou'
  )),
  ultimo_job_id uuid references public.jobs(id) on delete set null,
  provider text,
  provider_run_id text,
  posts_lidos integer not null default 0 check (posts_lidos >= 0),
  posts_novos integer not null default 0 check (posts_novos >= 0),
  ultima_varredura_em timestamptz,
  proxima_varredura_em timestamptz not null default now(),
  ultimo_erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index watchlist_operacao_due_idx
  on public.watchlist_operacao_privada (proxima_varredura_em)
  where status <> 'rodando';

alter table public.watchlist_operacao_privada enable row level security;
revoke all on public.watchlist_operacao_privada from public, anon, authenticated;
grant all on public.watchlist_operacao_privada to service_role;

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

create or replace function public.intent_watchlist_status_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  if new.status = 'monitorada'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.intent_enqueue_watchlist_source(new.id, 'aprovacao');
  end if;
  return new;
end;
$$;

drop trigger if exists fontes_enqueue_watchlist_on_approval on public.fontes;
create trigger fontes_enqueue_watchlist_on_approval
  after insert or update of status on public.fontes
  for each row execute function public.intent_watchlist_status_trigger();

revoke all on function public.intent_enqueue_watchlist_source(uuid, text) from public, anon, authenticated;
revoke all on function public.intent_enqueue_due_watchlists() from public, anon, authenticated;
revoke all on function public.intent_watchlist_status_trigger() from public, anon, authenticated;
grant execute on function public.intent_enqueue_watchlist_source(uuid, text) to service_role;
grant execute on function public.intent_enqueue_due_watchlists() to service_role;

-- The legacy weekly source monitor duplicates the V1 watchlist cascade and can
-- spend twice for the same posts. The new cycle is hourly, but each source only
-- becomes eligible again 24 hours after a completed sweep.
do $migration$
declare
  legacy_job_id bigint;
  existing_job_id bigint;
begin
  select jobid into legacy_job_id
    from cron.job
   where jobname = 'signal-lab-weekly-monitoring';
  if legacy_job_id is not null then
    perform cron.unschedule(legacy_job_id);
  end if;

  select jobid into existing_job_id
    from cron.job
   where jobname = 'intent-v1-watchlist-cycle';
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'intent-v1-watchlist-cycle',
    '7 * * * *',
    $job$select public.intent_enqueue_due_watchlists();$job$
  );
end
$migration$;

comment on table public.watchlist_operacao_privada is
  'Server-only state for recurring sweeps of approved people and company Watchlists.';
comment on function public.intent_enqueue_due_watchlists() is
  'Queues each due approved Watchlist at most once, while the daily engine budget remains the final cost gate.';
