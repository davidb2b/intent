-- Progresso operacional real: cada etapa é atualizada pela Edge Function que
-- está executando a coleta. O front apenas lê este estado; não simula avanço.
alter table public.execucoes
  add column if not exists etapa_atual text not null default 'aguardando',
  add column if not exists progresso smallint not null default 0
    check (progresso between 0 and 100),
  add column if not exists mensagem_progresso text;

update public.execucoes
set etapa_atual = case
  when status = 'concluida' then 'concluida'
  when status in ('falhou', 'abortada_por_custo') then 'falhou'
  else 'aguardando'
end,
progresso = case
  when status = 'concluida' then 100
  else 0
end,
mensagem_progresso = case
  when status = 'concluida' then 'Execução concluída.'
  when status in ('falhou', 'abortada_por_custo') then erro
  else 'Aguardando início da execução.'
end
where etapa_atual = 'aguardando'
  and progresso = 0
  and mensagem_progresso is null;

create index if not exists execucoes_projeto_status_idx
  on public.execucoes (projeto_id, status, iniciada_em desc);
