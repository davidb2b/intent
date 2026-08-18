-- Intent v1, Phase 2: private company identity and durable company expansion.

create table public.empresa_operacao_privada (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  apollo_id text,
  dominio text,
  nome_literal text not null,
  expansao_icp_id uuid references public.icps(id) on delete set null,
  expansao_status text not null default 'pendente'
    check (expansao_status in ('pendente', 'rodando', 'concluida', 'falhou')),
  expandida_em timestamptz,
  ultimo_erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (apollo_id is not null or dominio is not null)
);

create unique index empresa_operacao_project_apollo_idx
  on public.empresa_operacao_privada (projeto_id, apollo_id)
  where apollo_id is not null;

create unique index empresa_operacao_project_domain_idx
  on public.empresa_operacao_privada (projeto_id, lower(dominio))
  where dominio is not null;

create index empresa_operacao_pending_idx
  on public.empresa_operacao_privada (projeto_id, atualizado_em)
  where expansao_status in ('pendente', 'falhou');

alter table public.empresa_operacao_privada enable row level security;
revoke all on public.empresa_operacao_privada from public, anon, authenticated;
grant all on public.empresa_operacao_privada to service_role;

-- Preserve the company identity already proven by the vertical Phase 2 run.
insert into public.empresa_operacao_privada (
  empresa_id,
  projeto_id,
  apollo_id,
  dominio,
  nome_literal
)
select distinct on (signal.empresa_id)
  signal.empresa_id,
  signal.projeto_id,
  nullif(operation.empresa_candidata->>'apolloId', ''),
  nullif(lower(operation.empresa_candidata->>'domain'), ''),
  coalesce(nullif(operation.empresa_candidata->>'name', ''), company.nome)
from public.sinais signal
join public.empresas company on company.id = signal.empresa_id
join public.pessoa_operacao_privada operation on operation.pessoa_id = signal.pessoa_id
where signal.empresa_id is not null
  and operation.empresa_candidata is not null
  and (
    nullif(operation.empresa_candidata->>'apolloId', '') is not null
    or nullif(operation.empresa_candidata->>'domain', '') is not null
  )
order by signal.empresa_id, signal.capturado_em desc
on conflict (empresa_id) do update
set apollo_id = coalesce(excluded.apollo_id, empresa_operacao_privada.apollo_id),
    dominio = coalesce(excluded.dominio, empresa_operacao_privada.dominio),
    nome_literal = excluded.nome_literal,
    atualizado_em = now();

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
     and (
       status in ('pendente', 'rodando', 'aguardando_creditos')
       or (
         target_type in ('varrer_empresa', 'varrer_post', 'investigar_autor')
         and status = 'concluido'
       )
     )
   order by criado_em desc
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

revoke all on function public.intent_enqueue_job(uuid, text, jsonb, smallint, smallint) from public, anon, authenticated;
grant execute on function public.intent_enqueue_job(uuid, text, jsonb, smallint, smallint) to service_role;

comment on table public.empresa_operacao_privada is
  'Server-only Apollo company identity and expansion state. Never expose provider identifiers to browser roles.';
