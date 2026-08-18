# Proteção de dados privados e RLS — contrato da Fase 0

## Objetivo

Um usuário autenticado pode ler somente o resultado comercial do próprio
workspace. O token público do browser nunca concede acesso a radar interno,
fit, IDs de fornecedor, contatos não revelados, fila, payload bruto ou custo
real.

## Classificação

| Classe | Exemplos | Acesso do cliente |
|---|---|---|
| Resultado visível | nome, cargo, LinkedIn, intenção, status, evidência | leitura no próprio projeto |
| Auditoria do cliente | `fora_icp` sem fit | somente na visão Todas |
| Operação privada | `vigiado`, fit, origem, Apollo ID | nenhum |
| Contato privado | e-mail e telefone não revelados | nenhum |
| Infraestrutura | jobs, payloads brutos, custos USD | nenhum |
| Contato revelado | concessão e tipo revelado | somente via Edge Function |

## Controles obrigatórios

1. RLS filtra sempre por `projetos.owner_id = auth.uid()`.
2. `vigiado` não passa pela policy de leitura de pessoas.
3. `pessoas` usa grant de coluna por allowlist; RLS sozinho não esconde
   `fit`, `origem` ou `apollo_id`.
4. E-mail e telefone saem de `pessoas` e ficam em
   `pessoa_contatos_privados`, sem policy e sem grant para `anon` ou
   `authenticated`.
5. `jobs`, `integracao_raw_payloads`, `custos` e a parte operacional da pessoa
   são `service_role` only.
6. Browser não escreve diretamente ingestão, julgamento, créditos ou contato.
7. `reveal-contact` valida ownership, reserva crédito atomicamente, registra
   idempotência e devolve apenas o campo solicitado.
8. A concessão não guarda contato em log; logs recebem somente pessoa, tipo,
   custo e resultado.
9. Admin interno usa claim/allowlist no backend; e-mail no front não define
   privilégio.
10. Toda função `security definer` fixa `search_path`, revoga `PUBLIC` e recebe
    grant explícito.

## Estratégia de schema

- `pessoas`: colunas seguras do cliente + flags de disponibilidade;
- `pessoa_operacao_privada`: fit, origem, Apollo ID e dados do radar;
- `pessoa_contatos_privados`: contato criptografado/server-only;
- `contatos_revelados`: ledger de concessões, sem duplicar cobrança;
- `sinais`: evidência e julgamento auditável por projeto;
- `jobs`, `integracao_raw_payloads`, `custos` e
  `watchlist_operacao_privada`: server-only;
- RPCs explícitas para marcar cliente, ativar ICP e revelar contato.

## Evidência automatizada

`supabase/tests/intent_v1_private_data_rls.sql` preserva o contrato isolado da
Fase 0. O teste `supabase/tests/intent_v1_foundation_rls.sql` executa os mesmos
asserts sobre o schema real criado pelas migrations: isolamento entre dois
owners, invisibilidade de `vigiado`, continuidade da revisão humana legada,
ausência dos campos operacionais na tabela pública e bloqueio das tabelas
server-only. O teste passou antes do `db push`; o lint do schema remoto também
terminou sem erros.
