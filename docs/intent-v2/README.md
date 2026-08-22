# Intent v2

Este diretório é a fonte de planejamento do Intent v2. Ele substitui, para a
nova entrega, o fluxo histórico de palavra-chave → posts → comentários. Os
documentos em `docs/intent-v1/` continuam preservados como histórico técnico e
registro do que já foi entregue, mas não definem o comportamento do v2.

## Objetivo

O Intent v2 parte do site da própria empresa para construir um ICP editável e,
com base nele, encontrar pessoas que demonstram intenção pública com evidência
literal. O produto deve levar o usuário do contexto da empresa até um lead
priorizado, sem mostrar mecânicas internas de coleta, fornecedores ou modelos.

## Ordem das fases

| Fase | Entrega principal | Saída obrigatória |
|---|---|---|
| 0 | Baseline, contratos v2 e critérios de aceite | Matriz congelada, produção observada e riscos registrados |
| 1 | Banco, migrações e contratos de domínio sem score numérico | Schema aditivo, RLS e invariantes testados |
| 2 | Onboarding site → Apollo → LinkedIn | Firmografia e contexto real, com campos ausentes preservados |
| 3 | Prompts IA1a, IA1b e IA1c | ICP estruturado, verificável e sem valores inventados |
| 4 | Pré-filtros, contexto de post e higiene | Cortes baratos antes da IA e evidência obrigatória |
| 5 | Julgamento IA2/IA3 | Relevância binária, nível forte/médio/fraco e prova literal |
| 6 | Gate binário, fila e cascatas | Radar consistente, deduplicado e pausável |
| 7 | ICP, Início, Pessoas, Contas e Watchlist | UI alinhada ao protótipo, sem mock em produção |
| 8 | Homologação, segurança, custos e publicação | Aceite do cliente e ciclo automático comprovado |

## Regras que não podem ser quebradas

- Nenhum mock, placeholder ou dado inventado em produção.
- Nenhum score numérico de intenção no produto; a prioridade da fila é interna
  e não é apresentada como nota de fit.
- Nenhum julgamento sem o texto do post relacionado.
- Reações servem para descoberta; comentários são a fonte de julgamento.
- Dados não confirmados ficam vazios ou nulos, nunca recebem `Outros` ou
  `Desconhecido` como valor válido.
- O Brasil é uma regra fixa de escopo e deve ser validado no retorno da fonte.
- Apollo, Apify e IA só podem ser chamados pelo backend.
- Toda mudança segue branch própria, testes, preview, validação de produção e
  merge explícito na `main`.

## Estado atual

As Fases 0 e 1 estão concluídas: baseline, contratos, migration aditiva e RLS
foram separados do domínio histórico. A Fase 2 está implementada no backend e
aguarda publicação da Edge Function e uma execução real homologada. A tela
histórica continua isolada até que a Fase 3 complete o rascunho v2.

Próximo passo: Fase 3 — gerar apenas os campos estruturados de empresa, ICP e
sinais a partir das evidências confirmadas, sem inferência e sem score numérico.

## Documentos

- [`phase-0-baseline.md`](phase-0-baseline.md): baseline observado, matriz de
  aceite e critérios de saída da Fase 0.
- [`phase-1-domain.md`](phase-1-domain.md): schema aditivo e contratos de
  domínio do v2.
- [`phase-2-onboarding.md`](phase-2-onboarding.md): site, Apollo, LinkedIn,
  cache, créditos e gate de publicação.
