-- Intent v1, Phase 1: onboarding persistence and atomic credit operations.

alter table public.projetos
  add column if not exists site_url text,
  add column if not exists site_dominio text,
  add column if not exists linkedin_empresa_url text,
  add column if not exists onboarding_aviso text;

alter table public.icps
  add column if not exists fonte_execucao_id uuid references public.execucoes(id) on delete set null,
  add column if not exists atualizado_em timestamptz not null default now();

create unique index if not exists execucoes_one_running_onboarding_idx
  on public.execucoes (projeto_id, tipo)
  where tipo = 'onboarding' and status = 'rodando';

create or replace function public.intent_reserve_onboarding_credits(
  target_project_id uuid,
  target_reference text,
  target_amount integer default 12
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_competence date := date_trunc('month', timezone('America/Sao_Paulo', now()))::date;
  monthly_limit integer;
  credit_account public.contas_credito%rowtype;
begin
  if target_amount <= 0 then
    raise exception using errcode = '22023', message = 'A reserva deve ser positiva.';
  end if;

  select creditos_mensais
    into monthly_limit
    from public.projetos
   where id = target_project_id;

  if monthly_limit is null then
    raise exception using errcode = 'P0002', message = 'Projeto não encontrado.';
  end if;

  insert into public.contas_credito (projeto_id, competencia, limite)
  values (target_project_id, current_competence, monthly_limit)
  on conflict (projeto_id, competencia) do nothing;

  select *
    into credit_account
    from public.contas_credito
   where projeto_id = target_project_id
     and competencia = current_competence
   for update;

  if exists (
    select 1
      from public.creditos
     where projeto_id = target_project_id
       and referencia = target_reference
       and movimento = 'reserva'
  ) then
    return credit_account.id;
  end if;

  if credit_account.limite - credit_account.reservado - credit_account.consumido < target_amount then
    raise exception using errcode = 'P0001', message = 'Saldo de créditos insuficiente para o onboarding.';
  end if;

  update public.contas_credito
     set reservado = reservado + target_amount,
         versao = versao + 1,
         atualizado_em = now()
   where id = credit_account.id;

  insert into public.creditos (
    projeto_id,
    conta_id,
    evento,
    movimento,
    quantidade,
    referencia,
    metadata
  ) values (
    target_project_id,
    credit_account.id,
    'onboarding',
    'reserva',
    target_amount,
    target_reference,
    jsonb_build_object('fase', 1)
  );

  return credit_account.id;
end;
$$;

create or replace function public.intent_consume_onboarding_credits(
  target_project_id uuid,
  target_reference text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  reservation public.creditos%rowtype;
begin
  if exists (
    select 1
      from public.creditos
     where projeto_id = target_project_id
       and referencia = target_reference
       and movimento = 'consumo'
  ) then
    return;
  end if;

  select *
    into reservation
    from public.creditos
   where projeto_id = target_project_id
     and referencia = target_reference
     and movimento = 'reserva'
   for update;

  if reservation.id is null then
    raise exception using errcode = 'P0002', message = 'Reserva de onboarding não encontrada.';
  end if;

  update public.contas_credito
     set reservado = reservado - reservation.quantidade,
         consumido = consumido + reservation.quantidade,
         versao = versao + 1,
         atualizado_em = now()
   where id = reservation.conta_id
     and reservado >= reservation.quantidade;

  if not found then
    raise exception using errcode = '23514', message = 'Reserva de créditos inconsistente.';
  end if;

  insert into public.creditos (
    projeto_id,
    conta_id,
    evento,
    movimento,
    quantidade,
    referencia,
    metadata
  ) values (
    target_project_id,
    reservation.conta_id,
    'onboarding',
    'consumo',
    reservation.quantidade,
    target_reference,
    jsonb_build_object('fase', 1)
  );
end;
$$;

create or replace function public.intent_refund_onboarding_credits(
  target_project_id uuid,
  target_reference text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  reservation public.creditos%rowtype;
begin
  if exists (
    select 1
      from public.creditos
     where projeto_id = target_project_id
       and referencia = target_reference
       and movimento in ('consumo', 'estorno')
  ) then
    return;
  end if;

  select *
    into reservation
    from public.creditos
   where projeto_id = target_project_id
     and referencia = target_reference
     and movimento = 'reserva'
   for update;

  if reservation.id is null then
    return;
  end if;

  update public.contas_credito
     set reservado = reservado - reservation.quantidade,
         versao = versao + 1,
         atualizado_em = now()
   where id = reservation.conta_id
     and reservado >= reservation.quantidade;

  if not found then
    raise exception using errcode = '23514', message = 'Reserva de créditos inconsistente.';
  end if;

  insert into public.creditos (
    projeto_id,
    conta_id,
    evento,
    movimento,
    quantidade,
    referencia,
    metadata
  ) values (
    target_project_id,
    reservation.conta_id,
    'onboarding',
    'estorno',
    reservation.quantidade,
    target_reference,
    jsonb_build_object('fase', 1)
  );
end;
$$;

create or replace function public.intent_activate_icp(
  target_project_id uuid,
  target_icp_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_icp public.icps%rowtype;
  topic text;
  job_payload jsonb;
  job_hash text;
begin
  select *
    into target_icp
    from public.icps
   where id = target_icp_id
     and projeto_id = target_project_id
   for update;

  if target_icp.id is null then
    raise exception using errcode = 'P0002', message = 'ICP não encontrado.';
  end if;

  if target_icp.status = 'arquivado' then
    raise exception using errcode = '22023', message = 'Um ICP arquivado não pode ser ativado.';
  end if;

  update public.icps
     set status = 'arquivado',
         atualizado_em = now()
   where projeto_id = target_project_id
     and status = 'ativo'
     and id <> target_icp_id;

  update public.icps
     set status = 'ativo',
         ativado_em = coalesce(ativado_em, now()),
         atualizado_em = now()
   where id = target_icp_id;

  update public.projetos
     set intent_people_first = true,
         onboarding_status = 'concluido',
         onboarding_aviso = null
   where id = target_project_id;

  for topic in
    select jsonb_array_elements_text(target_icp.sinais_de_compra -> 'temas')
  loop
    insert into public.termos (projeto_id, termo, ativo)
    values (target_project_id, topic, true)
    on conflict (projeto_id, termo) do update set ativo = excluded.ativo;
  end loop;

  job_payload := jsonb_build_object('icp_id', target_icp_id, 'versao', target_icp.versao);
  job_hash := encode(digest(job_payload::text, 'sha256'), 'hex');

  insert into public.jobs (projeto_id, tipo, payload, payload_hash)
  select target_project_id, 'semear_radar', job_payload, job_hash
  where not exists (
    select 1
      from public.jobs
     where projeto_id = target_project_id
       and tipo = 'semear_radar'
       and payload_hash = job_hash
       and status in ('pendente', 'rodando', 'aguardando_creditos')
  );

  return target_icp.versao;
end;
$$;

revoke all on function public.intent_reserve_onboarding_credits(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.intent_consume_onboarding_credits(uuid, text) from public, anon, authenticated;
revoke all on function public.intent_refund_onboarding_credits(uuid, text) from public, anon, authenticated;
revoke all on function public.intent_activate_icp(uuid, uuid) from public, anon, authenticated;

grant execute on function public.intent_reserve_onboarding_credits(uuid, text, integer) to service_role;
grant execute on function public.intent_consume_onboarding_credits(uuid, text) to service_role;
grant execute on function public.intent_refund_onboarding_credits(uuid, text) to service_role;
grant execute on function public.intent_activate_icp(uuid, uuid) to service_role;

comment on function public.intent_reserve_onboarding_credits(uuid, text, integer) is
  'Atomically reserves onboarding credits for an idempotent reference.';
comment on function public.intent_activate_icp(uuid, uuid) is
  'Activates one ICP version, seeds topics and queues the Phase 2 radar job.';
