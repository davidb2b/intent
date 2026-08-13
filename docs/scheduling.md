# Agendamento do monitoramento

O monitoramento semanal usa a mesma Edge Function da execução manual. A
diferença é a autenticação: a execução agendada não usa sessão de usuário; ela
usa o secret de servidor `SCHEDULER_SECRET` no header `x-scheduler-secret`.

## Configuração aplicada

O agendamento está ativo no projeto Supabase:

1. As extensões `pg_cron` e `pg_net` estão habilitadas.
2. O secret de servidor `SCHEDULER_SECRET` está cadastrado nas Edge Functions.
3. Os valores de URL do projeto, chave pública e secret do agendador estão no
   Supabase Vault; não existem credenciais no repositório nem no job cron.
4. O job `signal-lab-weekly-monitoring` está ativo com a expressão
   `0 9 * * 1`, que equivale a segunda-feira, 06:00 BRT (`09:00 UTC`).
5. A chamada usa `POST /functions/v1/run-monitoring`, com `janela: "month"`
   para cada pesquisa ativa que tenha ao menos uma fonte monitorada. Ela envia `apikey` e
   `Authorization: Bearer ...` com a chave pública armazenada no Vault, além
   de `x-scheduler-secret`.

Exemplo de body:

```json
{
  "projectId": "<uuid-do-projeto>",
  "janela": "month"
}
```

A função força `origem: "agendada"`, registra uma execução por pesquisa no
histórico e continua aplicando RLS lógico, deduplicação, filtro brasileiro e
limites de custo. Sem o secret correto, a chamada não é aceita.

## Estado atual

O contrato seguro e a infraestrutura do agendamento estão ativos. A chamada
foi validada em 13/08/2026 com os mesmos headers do cron e um projeto
inexistente: a função respondeu `404 Projeto agendado não encontrado`,
confirmando que o gateway e a autenticação do agendador foram atravessados sem
iniciar uma coleta ou gerar custo. A primeira execução real ocorrerá no
próximo horário programado.
