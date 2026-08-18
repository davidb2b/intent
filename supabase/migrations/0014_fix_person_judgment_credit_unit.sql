-- Intent v1 credit invariant: one product credit per person evaluated in one
-- watch cycle, regardless of how many public activities were judged.
--
-- Phase 2 homologation initially wrote one credit per candidate activity. The
-- compensating entries below preserve the ledger while returning duplicate
-- consumption to the account balance.

do $correction$
declare
  duplicate_credit record;
begin
  for duplicate_credit in
    with ranked as (
      select
        credit.*,
        candidate.pessoa_id,
        row_number() over (
          partition by credit.projeto_id, candidate.pessoa_id, date_trunc('minute', candidate.criado_em)
          order by credit.criado_em, credit.id
        ) as position_in_cycle
      from public.creditos credit
      join public.sinais_candidatos_privados candidate
        on candidate.id::text = substring(credit.referencia from '^pessoa_julgada:(.*)$')
       and candidate.projeto_id = credit.projeto_id
      where credit.evento = 'pessoa_julgada'
        and credit.movimento = 'consumo'
        and credit.referencia like 'pessoa_julgada:%'
        and not exists (
          select 1
          from public.creditos correction
          where correction.projeto_id = credit.projeto_id
            and correction.referencia = credit.referencia
            and correction.movimento = 'estorno'
        )
    )
    select * from ranked where position_in_cycle > 1
  loop
    update public.contas_credito
       set consumido = consumido - duplicate_credit.quantidade,
           versao = versao + 1,
           atualizado_em = now()
     where id = duplicate_credit.conta_id
       and consumido >= duplicate_credit.quantidade;

    if not found then
      raise exception using errcode = '23514', message = 'Saldo inconsistente durante correção de crédito por pessoa.';
    end if;

    insert into public.creditos (
      projeto_id,
      conta_id,
      job_id,
      evento,
      movimento,
      quantidade,
      referencia,
      metadata
    ) values (
      duplicate_credit.projeto_id,
      duplicate_credit.conta_id,
      duplicate_credit.job_id,
      duplicate_credit.evento,
      'estorno',
      duplicate_credit.quantidade,
      duplicate_credit.referencia,
      jsonb_build_object(
        'fase', 2,
        'motivo', 'correcao_unidade_pessoa_por_ciclo',
        'migration', '0014'
      )
    ) on conflict (projeto_id, referencia, movimento) do nothing;
  end loop;
end
$correction$;
