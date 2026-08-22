-- Intent v2 — Fase 3: trilha de auditoria da geração estruturada.
-- O resultado continua no documento versionado do ICP. Estes campos apenas
-- registram qual execução o gerou, quando e sob qual contrato de prompt.

alter table public.intent_v2_icps
  add column if not exists geracao_execucao_id uuid references public.execucoes(id) on delete set null,
  add column if not exists modelo_geracao text,
  add column if not exists prompt_versao text,
  add column if not exists custo_geracao_usd numeric not null default 0 check (custo_geracao_usd >= 0),
  add column if not exists gerado_em timestamptz;

comment on column public.intent_v2_icps.geracao_execucao_id is
  'Execução auditável que gerou o contexto estruturado da empresa, ICP e sinais.';
comment on column public.intent_v2_icps.prompt_versao is
  'Contrato de geração aplicado. Não representa uma nota ou decisão comercial.';
