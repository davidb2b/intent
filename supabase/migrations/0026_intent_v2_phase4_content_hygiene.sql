-- Intent v2 — Fase 4: higiene determinística antes da análise de intenção.
-- Comentários sem texto do post e interações fora do tema são registrados, mas
-- não entram na fila de IA. Reações continuam apenas como histórico público.

alter table public.jobs drop constraint if exists jobs_tipo_check;
alter table public.jobs add constraint jobs_tipo_check check (tipo in (
  'gerar_icp', 'semear_radar', 'vigiar_pessoa', 'julgar_sinal',
  'varrer_post', 'varrer_empresa', 'investigar_autor',
  'varrer_watchlist', 'revelar_contato', 'recuperar_contexto_post'
));

create table public.intent_comentarios_higiene_privada (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  pessoa_id uuid references public.pessoas(id) on delete set null,
  empresa_id uuid references public.empresas(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  icp_id uuid references public.icps(id) on delete set null,
  urn_unico text not null,
  comentario text not null check (char_length(btrim(comentario)) > 0),
  post_url text not null,
  contexto_post_disponivel boolean not null default false,
  decisao text not null check (decisao in ('aprovado', 'aguardando_contexto', 'descartado')),
  motivo text check (motivo in (
    'contexto_post_ausente', 'contexto_post_indisponivel',
    'comentario_de_cortesia', 'comentario_fora_do_tema', 'perfil_sem_termos'
  )),
  termos_detectados text[] not null default '{}'::text[],
  origem text not null check (origem in ('atividade_perfil', 'cascata_post', 'recuperacao_contexto')),
  provider text,
  provider_run_id text,
  ocorrido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (projeto_id, urn_unico)
);

create index intent_higiene_project_decision_idx
  on public.intent_comentarios_higiene_privada (projeto_id, decisao, atualizado_em desc);
create index intent_higiene_post_pending_context_idx
  on public.intent_comentarios_higiene_privada (post_id, atualizado_em)
  where decisao = 'aguardando_contexto';

alter table public.intent_comentarios_higiene_privada enable row level security;
revoke all on public.intent_comentarios_higiene_privada from public, anon, authenticated;
grant all on public.intent_comentarios_higiene_privada to service_role;

create or replace view public.intent_metricas_higiene_comentarios_privada
with (security_invoker = true)
as
select
  projeto_id,
  count(*) as comentarios_registrados,
  count(*) filter (where not contexto_post_disponivel) as comentarios_sem_contexto,
  coalesce(round(100.0 * count(*) filter (where not contexto_post_disponivel) / nullif(count(*), 0), 2), 0) as percentual_sem_contexto,
  count(*) filter (where decisao = 'aprovado') as comentarios_aprovados,
  count(*) filter (where decisao = 'descartado') as comentarios_descartados
from public.intent_comentarios_higiene_privada
group by projeto_id;

revoke all on public.intent_metricas_higiene_comentarios_privada from public, anon, authenticated;
grant select on public.intent_metricas_higiene_comentarios_privada to service_role;

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
    'varrer_watchlist', 'revelar_contato', 'recuperar_contexto_post'
  ) then
    raise exception using errcode = '22023', message = 'Tipo de job inválido.';
  end if;
  if jsonb_typeof(normalized_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Payload do job deve ser um objeto.';
  end if;
  target_hash := encode(digest(normalized_payload::text, 'sha256'), 'hex');
  select id into existing_id from public.jobs
   where projeto_id = target_project_id and tipo = target_type and payload_hash = target_hash
     and (status in ('pendente', 'rodando', 'aguardando_creditos')
       or (target_type in ('varrer_empresa', 'varrer_post', 'investigar_autor') and status = 'concluido'))
   order by criado_em desc limit 1;
  if existing_id is not null then return existing_id; end if;
  insert into public.jobs (projeto_id, tipo, payload, payload_hash, prioridade, max_tentativas)
  values (target_project_id, target_type, normalized_payload, target_hash, target_priority, target_max_attempts)
  returning id into inserted_id;
  return inserted_id;
end;
$$;

revoke all on function public.intent_enqueue_job(uuid, text, jsonb, smallint, smallint) from public, anon, authenticated;
grant execute on function public.intent_enqueue_job(uuid, text, jsonb, smallint, smallint) to service_role;
