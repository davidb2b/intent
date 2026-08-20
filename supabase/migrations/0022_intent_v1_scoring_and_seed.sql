-- Intent v1 conformance: the initial Apollo seed is a project setting and
-- intention is the capped, exponentially decayed sum of public signals.

alter table public.projetos
  add column if not exists tamanho_semente_inicial integer not null default 500;

alter table public.projetos
  drop constraint if exists projetos_tamanho_semente_inicial_check,
  add constraint projetos_tamanho_semente_inicial_check
    check (tamanho_semente_inicial between 1 and 5000);

create or replace function public.intent_recalculate_person_intent(target_person_id uuid)
returns table (intencao smallint, status text, ultimo_sinal_em timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_person public.pessoas%rowtype;
  next_intent smallint;
  next_status text;
  next_signal_at timestamptz;
begin
  select * into target_person
    from public.pessoas
   where id = target_person_id
   for update;

  if target_person.id is null then
    raise exception using errcode = 'P0002', message = 'Pessoa não encontrada para recalcular intenção.';
  end if;

  select
    least(100, round(coalesce(sum(
      greatest(0, least(100, signal.nota))
      * power(0.5, greatest(0, extract(epoch from (now() - signal.ocorrido_em)) / 86400) / 30)
    ), 0)))::smallint,
    max(signal.ocorrido_em)
    into next_intent, next_signal_at
    from public.sinais signal
   where signal.pessoa_id = target_person_id;

  next_status := case
    when target_person.status = 'cliente' then 'cliente'
    when target_person.status = 'fora_icp' then 'fora_icp'
    when next_intent >= 80 then 'lead'
    when next_intent > 0 then 'sinal_fraco'
    else 'vigiado'
  end;

  update public.pessoas
     set intencao = next_intent,
         status = next_status,
         ultimo_sinal_em = next_signal_at
   where id = target_person_id;

  return query select next_intent, next_status, next_signal_at;
end;
$$;

revoke all on function public.intent_recalculate_person_intent(uuid) from public, anon, authenticated;
grant execute on function public.intent_recalculate_person_intent(uuid) to service_role;

create or replace function public.intent_credit_balance(target_project_id uuid)
returns table (limite integer, usados integer, reservados integer)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    project.creditos_mensais,
    coalesce(account.consumido, 0),
    coalesce(account.reservado, 0)
  from public.projetos project
  left join public.contas_credito account
    on account.projeto_id = project.id
   and account.competencia = date_trunc('month', timezone('America/Sao_Paulo', now()))::date
  where project.id = target_project_id
    and project.owner_id = auth.uid();
$$;

revoke all on function public.intent_credit_balance(uuid) from public, anon;
grant execute on function public.intent_credit_balance(uuid) to authenticated, service_role;

comment on column public.projetos.tamanho_semente_inicial is
  'Quantidade configurável de perfis para a descoberta inicial do ICP. Padrão do Intent v1: 500.';
comment on function public.intent_recalculate_person_intent(uuid) is
  'Soma notas de sinais reais com meia-vida de 30 dias, limitada a 100; mantém cliente e fora_icp como decisões humanas.';
