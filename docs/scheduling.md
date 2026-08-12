# Agendamento do monitoramento

O monitoramento semanal usa a mesma Edge Function da execução manual. A
diferença é a autenticação: a execução agendada não usa sessão de usuário; ela
usa o secret de servidor `SCHEDULER_SECRET` no header `x-scheduler-secret`.

## Configuração necessária

1. Criar um secret forte no Supabase com o nome `SCHEDULER_SECRET`.
2. Configurar o cron do Supabase para segunda-feira às 06:00 no fuso de São
   Paulo (`09:00 UTC`), chamando `POST /functions/v1/run-monitoring`.
3. Enviar no body o `projectId` do projeto e `janela: "month"`.
4. Enviar os headers `Content-Type: application/json` e
   `x-scheduler-secret` com o valor armazenado no secret.

Exemplo de body:

```json
{
  "projectId": "<uuid-do-projeto>",
  "janela": "month"
}
```

A função força `origem: "agendada"`, registra a execução no histórico e
continua aplicando RLS lógico, deduplicação, filtro brasileiro e limites de
custo. Sem o secret correto, a chamada não é aceita.

## Estado atual

O contrato seguro da função está implementado. A criação do secret e do job
cron ainda é uma configuração de infraestrutura e deve ser feita no projeto
Supabase antes de considerar o agendamento ativo.
