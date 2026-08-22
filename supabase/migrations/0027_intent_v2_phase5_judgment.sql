-- Intent v2 — Fase 5: decisões IA2/IA3 auditáveis, sem score numérico.
-- A tabela de sinais legada continua existindo para compatibilidade de leitura,
-- mas a prioridade v2 vem somente do nível forte/media/fraca registrado abaixo.

alter table public.sinais_candidatos_privados
  drop constraint if exists sinais_candidatos_privados_status_check,
  add constraint sinais_candidatos_privados_status_check
    check (status in ('pendente', 'aprovado', 'rejeitado', 'historico'));

create table public.intent_v2_julgamentos_privados (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  icp_v2_id uuid not null references public.intent_v2_icps(id) on delete restrict,
  candidato_id uuid not null references public.sinais_candidatos_privados(id) on delete cascade,
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  empresa_id uuid references public.empresas(id) on delete set null,
  sinal_id uuid references public.sinais(id) on delete set null,
  etapa text not null check (etapa in ('ia2_relevancia', 'ia3_nivel')),
  relevante boolean,
  nivel text check (nivel is null or nivel in ('forte', 'media', 'fraca')),
  porque text not null check (char_length(btrim(porque)) > 0),
  frase_prova text,
  fonte_prova text check (fonte_prova is null or fonte_prova in ('comentario', 'post')),
  resposta jsonb not null default '{}'::jsonb check (jsonb_typeof(resposta) = 'object'),
  modelo text not null,
  prompt_versao text not null,
  request_id text,
  custo_usd numeric not null default 0 check (custo_usd >= 0),
  latencia_ms integer not null default 0 check (latencia_ms >= 0),
  criado_em timestamptz not null default now(),
  unique (candidato_id, etapa),
  check (
    (etapa = 'ia2_relevancia' and relevante is not null and nivel is null)
    or (etapa = 'ia3_nivel' and relevante is true and nivel is not null)
  ),
  check (
    (frase_prova is null and fonte_prova is null)
    or (frase_prova is not null and fonte_prova is not null)
  )
);

create index intent_v2_judgments_person_idx
  on public.intent_v2_julgamentos_privados (projeto_id, pessoa_id, criado_em desc);

create index intent_v2_judgments_candidate_idx
  on public.intent_v2_julgamentos_privados (candidato_id, etapa);

comment on table public.intent_v2_julgamentos_privados is
  'Auditoria privada das decisões IA2/IA3. Forte vira lead, media vira sinal fraco e fraca fica no histórico.';
comment on column public.intent_v2_julgamentos_privados.frase_prova is
  'Trecho literal confirmado no comentário ou post público; sem correspondência literal, a atividade é descartada.';
comment on column public.sinais.nota is
  'Campo legado de compatibilidade. O Intent v2 não usa nem exibe nota numérica; sua prioridade vem de intent_v2_julgamentos_privados.nivel.';

alter table public.intent_v2_julgamentos_privados enable row level security;
revoke all on table public.intent_v2_julgamentos_privados from public, anon, authenticated;
grant all on table public.intent_v2_julgamentos_privados to service_role;

create or replace function public.intent_v2_apply_person_priority(target_person_id uuid)
returns table (status text, ultimo_sinal_em timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_person public.pessoas%rowtype;
  next_level text;
  next_signal_at timestamptz;
  next_status text;
begin
  select * into target_person from public.pessoas where id = target_person_id for update;
  if target_person.id is null then
    raise exception using errcode = 'P0002', message = 'Pessoa não encontrada para atualizar a prioridade.';
  end if;

  select judgment.nivel, candidate.ocorrido_em
    into next_level, next_signal_at
    from public.intent_v2_julgamentos_privados judgment
    join public.sinais_candidatos_privados candidate on candidate.id = judgment.candidato_id
   where judgment.pessoa_id = target_person_id
     and judgment.etapa = 'ia3_nivel'
     and judgment.relevante is true
   order by case judgment.nivel when 'forte' then 3 when 'media' then 2 else 1 end desc,
            candidate.ocorrido_em desc
   limit 1;

  next_status := case
    when target_person.status = 'cliente' then 'cliente'
    when target_person.status = 'fora_icp' then 'fora_icp'
    when next_level = 'forte' then 'lead'
    when next_level = 'media' then 'sinal_fraco'
    else 'vigiado'
  end;

  update public.pessoas
     set intencao = null,
         status = next_status,
         ultimo_sinal_em = next_signal_at
   where id = target_person_id;

  return query select next_status, next_signal_at;
end;
$$;

revoke all on function public.intent_v2_apply_person_priority(uuid) from public, anon, authenticated;
grant execute on function public.intent_v2_apply_person_priority(uuid) to service_role;

comment on function public.intent_v2_apply_person_priority(uuid) is
  'Aplica a prioridade do Intent v2 pelo nível auditado, sem usar nota ou score numérico.';
