-- Intent v1, Phase 2: durable people-first queue, signal staging and atomic
-- credits. All operational data remains service-role only.

create table public.sinais_candidatos_privados (
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
  post_url text,
  ocorrido_em timestamptz not null,
  provider text not null,
  provider_run_id text,
  status text not null default 'pendente'
    check (status in ('pendente', 'aprovado', 'rejeitado')),
  motivo_rejeicao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (projeto_id, urn_unico)
);

create index sinais_candidatos_pending_idx
  on public.sinais_candidatos_privados (projeto_id, criado_em)
  where status = 'pendente';

alter table public.sinais_candidatos_privados enable row level security;
revoke all on public.sinais_candidatos_privados from public, anon, authenticated;
grant all on public.sinais_candidatos_privados to service_role;

alter table public.pessoa_operacao_privada
  add column if not exists excluido boolean not null default false,
  add column if not exists fit_evidencia jsonb not null default '[]'::jsonb
    check (jsonb_typeof(fit_evidencia) = 'array'),
  add column if not exists empresa_candidata jsonb
    check (empresa_candidata is null or jsonb_typeof(empresa_candidata) = 'object'),
  add column if not exists atividade_status text
    check (atividade_status is null or atividade_status in (
      'activity_available', 'no_activity', 'profile_unavailable',
      'provider_partial', 'provider_error'
    )),
  add column if not exists atividade_verificada_em timestamptz;

create or replace function public.intent_enqueue_job(
  target_project_id uuid,
  target_type text,
  target_payload jsonb,
  target_priority smallint default 100,
  target_max_attempts smallint default 3
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  normalized_payload jsonb := coalesce(target_payload, '{}'::jsonb);
  target_hash text;
  existing_id uuid;
  inserted_id uuid;
begin
  if target_type not in (
    'gerar_icp', 'semear_radar', 'vigiar_pessoa', 'julgar_sinal',
    'varrer_post', 'varrer_empresa', 'investigar_autor',
    'varrer_watchlist', 'revelar_contato'
  ) then
    raise exception using errcode = '22023', message = 'Tipo de job inválido.';
  end if;

  if jsonb_typeof(normalized_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Payload do job deve ser um objeto.';
  end if;

  target_hash := encode(digest(normalized_payload::text, 'sha256'), 'hex');

  select id into existing_id
    from public.jobs
   where projeto_id = target_project_id
     and tipo = target_type
     and payload_hash = target_hash
     and status in ('pendente', 'rodando', 'aguardando_creditos')
   limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  insert into public.jobs (
    projeto_id, tipo, payload, payload_hash, prioridade, max_tentativas
  ) values (
    target_project_id,
    target_type,
    normalized_payload,
    target_hash,
    target_priority,
    target_max_attempts
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

create or replace function public.intent_claim_jobs(
  target_types text[] default null,
  target_project_id uuid default null,
  target_limit integer default 1,
  lease_seconds integer default 180
)
returns setof public.jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if target_limit < 1 or target_limit > 25 then
    raise exception using errcode = '22023', message = 'Quantidade de jobs fora do limite.';
  end if;
  if lease_seconds < 30 or lease_seconds > 900 then
    raise exception using errcode = '22023', message = 'Duração de lease fora do limite.';
  end if;

  return query
  with claimable as (
    select job.id
      from public.jobs job
     where (
       (job.status = 'pendente' and job.executar_apos <= now())
       or (job.status = 'rodando' and job.lease_ate < now())
     )
       and (target_types is null or job.tipo = any(target_types))
       and (target_project_id is null or job.projeto_id = target_project_id)
       and job.tentativas < job.max_tentativas
     order by job.prioridade asc, job.criado_em asc
     for update skip locked
     limit target_limit
  )
  update public.jobs job
     set status = 'rodando',
         tentativas = job.tentativas + 1,
         lease_token = gen_random_uuid(),
         lease_ate = now() + make_interval(secs => lease_seconds),
         atualizado_em = now(),
         ultimo_erro = null
    from claimable
   where job.id = claimable.id
  returning job.*;
end;
$$;

create or replace function public.intent_complete_job(
  target_job_id uuid,
  target_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.jobs
     set status = 'concluido',
         lease_ate = null,
         lease_token = null,
         atualizado_em = now(),
         concluido_em = now(),
         ultimo_erro = null
   where id = target_job_id
     and status = 'rodando'
     and lease_token = target_lease_token;
  return found;
end;
$$;

create or replace function public.intent_fail_job(
  target_job_id uuid,
  target_lease_token uuid,
  target_error text,
  retry_delay_seconds integer default 60
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_job public.jobs%rowtype;
  next_status text;
  reservation public.creditos%rowtype;
begin
  select * into target_job
    from public.jobs
   where id = target_job_id
     and status = 'rodando'
     and lease_token = target_lease_token
   for update;

  if target_job.id is null then
    return 'lease_invalido';
  end if;

  next_status := case
    when target_job.tentativas >= target_job.max_tentativas then 'falhou'
    else 'pendente'
  end;

  update public.jobs
     set status = next_status,
         executar_apos = case
           when next_status = 'pendente'
             then now() + make_interval(secs => greatest(5, least(retry_delay_seconds, 3600)))
           else executar_apos
         end,
         lease_ate = null,
         lease_token = null,
         ultimo_erro = left(coalesce(target_error, 'Falha sem detalhe.'), 1000),
         atualizado_em = now(),
         concluido_em = case when next_status = 'falhou' then now() else null end
   where id = target_job_id;

  if next_status = 'falhou' then
    for reservation in
      select credit.*
        from public.creditos credit
       where credit.job_id = target_job_id
         and credit.movimento = 'reserva'
         and not exists (
           select 1
             from public.creditos settlement
            where settlement.job_id = target_job_id
              and settlement.referencia = credit.referencia
              and settlement.movimento in ('consumo', 'estorno')
         )
       for update
    loop
      update public.contas_credito
         set reservado = reservado - reservation.quantidade,
             versao = versao + 1,
             atualizado_em = now()
       where id = reservation.conta_id
         and reservado >= reservation.quantidade;

      insert into public.creditos (
        projeto_id, conta_id, job_id, evento, movimento, quantidade, referencia, metadata
      ) values (
        reservation.projeto_id, reservation.conta_id, target_job_id,
        reservation.evento, 'estorno', reservation.quantidade,
        reservation.referencia, jsonb_build_object('fase', 2, 'motivo', 'job_falhou')
      ) on conflict (projeto_id, referencia, movimento) do nothing;
    end loop;

    update public.jobs set creditos_reservados = 0 where id = target_job_id;
  end if;

  return next_status;
end;
$$;

create or replace function public.intent_reserve_job_credits(
  target_job_id uuid,
  target_event text,
  target_amount integer,
  target_reference text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_job public.jobs%rowtype;
  current_competence date := date_trunc('month', timezone('America/Sao_Paulo', now()))::date;
  monthly_limit integer;
  credit_account public.contas_credito%rowtype;
begin
  if target_amount < 0 or target_event not in ('pessoa_julgada', 'email_revelado', 'telefone_revelado', 'verificacao_sem_sinal') then
    raise exception using errcode = '22023', message = 'Movimento de crédito inválido.';
  end if;

  select * into target_job from public.jobs where id = target_job_id for update;
  if target_job.id is null then
    raise exception using errcode = 'P0002', message = 'Job não encontrado.';
  end if;

  if exists (
    select 1 from public.creditos
     where projeto_id = target_job.projeto_id
       and referencia = target_reference
       and movimento in ('reserva', 'consumo')
  ) then
    return true;
  end if;

  select creditos_mensais into monthly_limit
    from public.projetos where id = target_job.projeto_id;

  insert into public.contas_credito (projeto_id, competencia, limite)
  values (target_job.projeto_id, current_competence, monthly_limit)
  on conflict (projeto_id, competencia) do nothing;

  select * into credit_account
    from public.contas_credito
   where projeto_id = target_job.projeto_id and competencia = current_competence
   for update;

  if credit_account.limite - credit_account.reservado - credit_account.consumido < target_amount then
    update public.jobs
       set status = 'aguardando_creditos', lease_ate = null, lease_token = null,
           ultimo_erro = 'Aguardando renovação de créditos.', atualizado_em = now()
     where id = target_job_id;
    return false;
  end if;

  update public.contas_credito
     set reservado = reservado + target_amount,
         versao = versao + 1,
         atualizado_em = now()
   where id = credit_account.id;

  update public.jobs
     set creditos_reservados = creditos_reservados + target_amount,
         atualizado_em = now()
   where id = target_job_id;

  insert into public.creditos (
    projeto_id, conta_id, job_id, evento, movimento, quantidade, referencia, metadata
  ) values (
    target_job.projeto_id, credit_account.id, target_job_id, target_event,
    'reserva', target_amount, target_reference, jsonb_build_object('fase', 2)
  );

  return true;
end;
$$;

create or replace function public.intent_settle_job_credits(
  target_job_id uuid,
  target_reference text,
  target_consume boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  reservation public.creditos%rowtype;
  target_movement text := case when target_consume then 'consumo' else 'estorno' end;
begin
  if exists (
    select 1 from public.creditos
     where job_id = target_job_id
       and referencia = target_reference
       and movimento = target_movement
  ) then
    return true;
  end if;

  select * into reservation
    from public.creditos
   where job_id = target_job_id
     and referencia = target_reference
     and movimento = 'reserva'
   for update;

  if reservation.id is null then
    return false;
  end if;

  update public.contas_credito
     set reservado = reservado - reservation.quantidade,
         consumido = consumido + case when target_consume then reservation.quantidade else 0 end,
         versao = versao + 1,
         atualizado_em = now()
   where id = reservation.conta_id
     and reservado >= reservation.quantidade;

  if not found then
    raise exception using errcode = '23514', message = 'Reserva de créditos inconsistente.';
  end if;

  update public.jobs
     set creditos_reservados = greatest(0, creditos_reservados - reservation.quantidade),
         atualizado_em = now()
   where id = target_job_id;

  insert into public.creditos (
    projeto_id, conta_id, job_id, evento, movimento, quantidade, referencia, metadata
  ) values (
    reservation.projeto_id, reservation.conta_id, target_job_id, reservation.evento,
    target_movement, reservation.quantidade, target_reference, jsonb_build_object('fase', 2)
  );

  return true;
end;
$$;

revoke all on function public.intent_enqueue_job(uuid, text, jsonb, smallint, smallint) from public, anon, authenticated;
revoke all on function public.intent_claim_jobs(text[], uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.intent_complete_job(uuid, uuid) from public, anon, authenticated;
revoke all on function public.intent_fail_job(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.intent_reserve_job_credits(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.intent_settle_job_credits(uuid, text, boolean) from public, anon, authenticated;

grant execute on function public.intent_enqueue_job(uuid, text, jsonb, smallint, smallint) to service_role;
grant execute on function public.intent_claim_jobs(text[], uuid, integer, integer) to service_role;
grant execute on function public.intent_complete_job(uuid, uuid) to service_role;
grant execute on function public.intent_fail_job(uuid, uuid, text, integer) to service_role;
grant execute on function public.intent_reserve_job_credits(uuid, text, integer, text) to service_role;
grant execute on function public.intent_settle_job_credits(uuid, text, boolean) to service_role;

comment on table public.sinais_candidatos_privados is
  'Server-only public activity awaiting strict ICP judgment. Never exposed to browser roles.';
comment on function public.intent_claim_jobs(text[], uuid, integer, integer) is
  'Atomically claims pending or expired jobs with SKIP LOCKED and a bounded lease.';

-- One short worker invocation per minute. The queue lease and SKIP LOCKED
-- guarantee that overlapping invocations cannot process the same job.
do $migration$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
    from cron.job
   where jobname = 'intent-v1-queue-worker';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'intent-v1-queue-worker',
    '* * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'signal_lab_project_url') || '/functions/v1/process-intent-jobs',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'signal_lab_publishable_key'),
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'signal_lab_publishable_key'),
          'x-scheduler-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'signal_lab_scheduler_secret')
        ),
        body := jsonb_build_object('maxJobs', 1)
      );
    $job$
  );
end
$migration$;
