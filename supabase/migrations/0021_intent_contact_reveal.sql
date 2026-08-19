-- Intent v1, Phase 2: explicit, idempotent contact reveal.
--
-- Contact values remain encrypted in pessoa_contatos_privados. This table only
-- coordinates a user-confirmed provider request and the matching credit ledger.

create table public.contato_revelacoes_privadas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  solicitado_por uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('email', 'telefone')),
  status text not null check (status in ('processando', 'revelado', 'indisponivel')),
  referencia_credito text not null unique,
  quantidade_creditos integer not null check (quantidade_creditos > 0),
  provider text,
  provider_reference text,
  metadata jsonb,
  motivo_indisponivel text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  concluido_em timestamptz,
  unique (projeto_id, pessoa_id, solicitado_por, tipo)
);

create index contato_revelacoes_privadas_project_recent_idx
  on public.contato_revelacoes_privadas (projeto_id, criado_em desc);

alter table public.contato_revelacoes_privadas enable row level security;
revoke all on public.contato_revelacoes_privadas from public, anon, authenticated;
grant all on public.contato_revelacoes_privadas to service_role;

create or replace function public.intent_begin_contact_reveal(
  target_project_id uuid,
  target_person_id uuid,
  target_user_id uuid,
  target_type text,
  target_amount integer default 1
)
returns table (status text, reveal_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_reveal public.contato_revelacoes_privadas%rowtype;
  target_person public.pessoas%rowtype;
  credit_account public.contas_credito%rowtype;
  current_competence date := date_trunc('month', timezone('America/Sao_Paulo', now()))::date;
  monthly_limit integer;
  new_reveal_id uuid := gen_random_uuid();
  credit_event text := case target_type when 'email' then 'email_revelado' else 'telefone_revelado' end;
  credit_reference text;
begin
  if target_type not in ('email', 'telefone') or target_amount <= 0 then
    raise exception using errcode = '22023', message = 'Solicitação de contato inválida.';
  end if;

  if not exists (
    select 1 from public.projetos
     where id = target_project_id and owner_id = target_user_id
  ) then
    raise exception using errcode = '42501', message = 'Você não tem permissão para consultar este contato.';
  end if;

  select * into target_person
    from public.pessoas
   where id = target_person_id and projeto_id = target_project_id;
  if target_person.id is null then
    raise exception using errcode = 'P0002', message = 'Pessoa não encontrada nesta operação.';
  end if;

  select * into target_reveal
    from public.contato_revelacoes_privadas
   where projeto_id = target_project_id
     and pessoa_id = target_person_id
     and solicitado_por = target_user_id
     and tipo = target_type
   for update;

  if target_reveal.id is not null then
    return query select target_reveal.status, target_reveal.id;
    return;
  end if;

  select creditos_mensais into monthly_limit
    from public.projetos where id = target_project_id;

  insert into public.contas_credito (projeto_id, competencia, limite)
  values (target_project_id, current_competence, monthly_limit)
  on conflict (projeto_id, competencia) do update
    set limite = greatest(
      public.contas_credito.reservado + public.contas_credito.consumido,
      excluded.limite
    ),
    atualizado_em = now();

  select * into credit_account
    from public.contas_credito
   where projeto_id = target_project_id and competencia = current_competence
   for update;

  if credit_account.limite - credit_account.reservado - credit_account.consumido < target_amount then
    return query select 'insufficient_credits'::text, null::uuid;
    return;
  end if;

  credit_reference := concat('contact-reveal:', new_reveal_id::text);

  insert into public.contato_revelacoes_privadas (
    id, projeto_id, pessoa_id, solicitado_por, tipo, status, referencia_credito, quantidade_creditos
  ) values (
    new_reveal_id, target_project_id, target_person_id, target_user_id, target_type,
    'processando', credit_reference, target_amount
  );

  update public.contas_credito
     set reservado = reservado + target_amount,
         versao = versao + 1,
         atualizado_em = now()
   where id = credit_account.id;

  insert into public.creditos (
    projeto_id, conta_id, job_id, evento, movimento, quantidade, referencia, metadata
  ) values (
    target_project_id, credit_account.id, null, credit_event, 'reserva', target_amount,
    credit_reference, jsonb_build_object('fase', 2, 'pessoa_id', target_person_id, 'solicitado_por', target_user_id)
  );

  return query select 'processando'::text, new_reveal_id;
end;
$$;

create or replace function public.intent_complete_contact_reveal(
  target_reveal_id uuid,
  target_ciphertext text,
  target_provider text,
  target_provider_reference text,
  target_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_reveal public.contato_revelacoes_privadas%rowtype;
  contact_event text;
  contact_column text;
begin
  if target_ciphertext is null or length(trim(target_ciphertext)) < 10 then
    raise exception using errcode = '22023', message = 'Contato protegido inválido.';
  end if;

  select * into target_reveal
    from public.contato_revelacoes_privadas
   where id = target_reveal_id
   for update;
  if target_reveal.id is null then
    raise exception using errcode = 'P0002', message = 'Solicitação de contato não encontrada.';
  end if;
  if target_reveal.status = 'revelado' then return true; end if;
  if target_reveal.status <> 'processando' then
    raise exception using errcode = '55000', message = 'Esta consulta de contato não pode ser concluída.';
  end if;

  contact_event := case target_reveal.tipo when 'email' then 'email_revelado' else 'telefone_revelado' end;
  contact_column := case target_reveal.tipo when 'email' then 'email_ciphertext' else 'telefone_ciphertext' end;

  if contact_column = 'email_ciphertext' then
    insert into public.pessoa_contatos_privados (
      pessoa_id, projeto_id, email_ciphertext, provider, provider_reference, provider_metadata
    ) values (
      target_reveal.pessoa_id, target_reveal.projeto_id, target_ciphertext,
      target_provider, target_provider_reference, coalesce(target_metadata, '{}'::jsonb)
    ) on conflict (pessoa_id) do update set
      email_ciphertext = excluded.email_ciphertext,
      provider = excluded.provider,
      provider_reference = excluded.provider_reference,
      provider_metadata = excluded.provider_metadata,
      atualizado_em = now();
    update public.pessoas set email_disponivel = true where id = target_reveal.pessoa_id;
  else
    insert into public.pessoa_contatos_privados (
      pessoa_id, projeto_id, telefone_ciphertext, provider, provider_reference, provider_metadata
    ) values (
      target_reveal.pessoa_id, target_reveal.projeto_id, target_ciphertext,
      target_provider, target_provider_reference, coalesce(target_metadata, '{}'::jsonb)
    ) on conflict (pessoa_id) do update set
      telefone_ciphertext = excluded.telefone_ciphertext,
      provider = excluded.provider,
      provider_reference = excluded.provider_reference,
      provider_metadata = excluded.provider_metadata,
      atualizado_em = now();
    update public.pessoas set telefone_disponivel = true where id = target_reveal.pessoa_id;
  end if;

  insert into public.contatos_revelados (
    projeto_id, pessoa_id, revelado_para, tipo, referencia_credito
  ) values (
    target_reveal.projeto_id, target_reveal.pessoa_id, target_reveal.solicitado_por,
    target_reveal.tipo, target_reveal.referencia_credito
  ) on conflict (projeto_id, pessoa_id, revelado_para, tipo) do nothing;

  update public.contas_credito
     set reservado = reservado - target_reveal.quantidade_creditos,
         consumido = consumido + target_reveal.quantidade_creditos,
         versao = versao + 1,
         atualizado_em = now()
   where id = (
     select conta_id from public.creditos
      where projeto_id = target_reveal.projeto_id
        and referencia = target_reveal.referencia_credito
        and movimento = 'reserva'
   ) and reservado >= target_reveal.quantidade_creditos;
  if not found then raise exception using errcode = '23514', message = 'Reserva de créditos inconsistente.'; end if;

  insert into public.creditos (
    projeto_id, conta_id, job_id, evento, movimento, quantidade, referencia, metadata
  ) select projeto_id, conta_id, null, contact_event, 'consumo', quantidade, referencia,
    jsonb_build_object('fase', 2, 'reveal_id', target_reveal.id)
    from public.creditos
   where projeto_id = target_reveal.projeto_id
     and referencia = target_reveal.referencia_credito
     and movimento = 'reserva';

  update public.contato_revelacoes_privadas
     set status = 'revelado', provider = target_provider,
         provider_reference = target_provider_reference,
         metadata = coalesce(target_metadata, '{}'::jsonb), atualizado_em = now(), concluido_em = now()
   where id = target_reveal.id;
  return true;
end;
$$;

create or replace function public.intent_cancel_contact_reveal(
  target_reveal_id uuid,
  target_reason text,
  target_retryable boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_reveal public.contato_revelacoes_privadas%rowtype;
  contact_event text;
begin
  select * into target_reveal
    from public.contato_revelacoes_privadas
   where id = target_reveal_id
   for update;
  if target_reveal.id is null then return false; end if;
  if target_reveal.status <> 'processando' then return target_reveal.status = 'indisponivel'; end if;

  contact_event := case target_reveal.tipo when 'email' then 'email_revelado' else 'telefone_revelado' end;
  update public.contas_credito
     set reservado = reservado - target_reveal.quantidade_creditos,
         versao = versao + 1,
         atualizado_em = now()
   where id = (
     select conta_id from public.creditos
      where projeto_id = target_reveal.projeto_id
        and referencia = target_reveal.referencia_credito
        and movimento = 'reserva'
   ) and reservado >= target_reveal.quantidade_creditos;
  if not found then raise exception using errcode = '23514', message = 'Reserva de créditos inconsistente.'; end if;

  insert into public.creditos (
    projeto_id, conta_id, job_id, evento, movimento, quantidade, referencia, metadata
  ) select projeto_id, conta_id, null, contact_event, 'estorno', quantidade, referencia,
    jsonb_build_object('fase', 2, 'motivo', left(coalesce(target_reason, 'Contato indisponível.'), 400))
    from public.creditos
   where projeto_id = target_reveal.projeto_id
     and referencia = target_reveal.referencia_credito
     and movimento = 'reserva';

  if target_retryable then
    delete from public.contato_revelacoes_privadas where id = target_reveal.id;
  else
    update public.contato_revelacoes_privadas
       set status = 'indisponivel', motivo_indisponivel = left(coalesce(target_reason, 'Contato indisponível.'), 400),
           atualizado_em = now(), concluido_em = now()
     where id = target_reveal.id;
  end if;
  return true;
end;
$$;

revoke all on function public.intent_begin_contact_reveal(uuid, uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.intent_complete_contact_reveal(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.intent_cancel_contact_reveal(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.intent_begin_contact_reveal(uuid, uuid, uuid, text, integer) to service_role;
grant execute on function public.intent_complete_contact_reveal(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.intent_cancel_contact_reveal(uuid, text, boolean) to service_role;

comment on table public.contato_revelacoes_privadas is
  'Server-only contact reveal state. Keeps explicit consent, idempotency and credit settlement together.';
