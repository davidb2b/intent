# Estratégia de migração sem perda de dados

## Regra principal

A evolução é aditiva. Nenhuma migration da transição apaga tabelas, colunas ou
dados. O produto legado continua operável até o novo motor passar pelos gates.

## Compatibilidade

| Legado | Intent v1 | Tratamento |
|---|---|---|
| `projetos` | workspace/projeto | Reutilizar e adicionar metadados de plano/onboarding |
| `termos` | temas derivados do ICP | Manter; popular somente após ativação |
| `fontes` | watchlist | Evoluir com `tipo_watchlist`; preservar fontes existentes |
| `posts` | contexto e cascata | Reutilizar com proveniência de captura |
| `comentarios` | uma origem de sinal | Preservar; novos eventos entram também em `sinais` |
| `pessoas` | radar e lista visível | Adicionar campos; não promover registros antigos automaticamente |
| `empresas` | contas | Adicionar nível e contadores derivados |
| `execucoes` | execuções do motor | Ampliar tipos sem invalidar histórico |
| `custos` | custo interno | Adicionar provider/operação/referência externa |

Tabelas novas: `icps`, `sinais`, `jobs`, `contas_credito`, `creditos`,
`pessoa_contatos_privados`, `contatos_revelados` e `integracao_raw_payloads`.

## Sequência segura

1. Criar enums/checks novos sem remover checks antigos.
2. Criar tabelas novas e índices concorrentes quando aplicável.
3. Adicionar colunas nullable nas tabelas legadas.
4. Backfill somente chaves técnicas comprováveis.
5. Criar views/projeções do novo front.
6. Adicionar RLS de leitura e negar escrita direta do browser.
7. Publicar novas Edge Functions sem desligar as antigas.
8. Ativar o novo fluxo apenas para workspaces com ICP ativo.
9. Validar preview com projeto de teste.
10. Trocar navegação e cron após aceite.
11. Arquivar o fluxo legado apenas em migration futura e reversível.

## RLS alvo

- Cliente autenticado lê somente dados visíveis do próprio projeto.
- Cliente não lê radar, fit, jobs, raw payloads, custo USD ou contatos privados.
- Cliente altera somente ações explícitas: edição do ICP, watchlist, marcação de
  cliente e curadoria permitida.
- Ingestão, julgamento, créditos e contato usam service role em função
  autenticada com checagem de ownership.
- Admin interno usa claim/allowlist própria; não inferir admin pelo e-mail no
  front.

## Rollback

Até o corte, rollback é desligar a flag `intent_people_first` e voltar à UI e
às funções legadas. Como migrations são aditivas, nenhum dado precisa ser
apagado. Jobs novos ficam pausados, não deletados.

## Dados antigos

Os registros existentes servem para histórico e regressão. Eles não recebem
`origem='semente_apollo'`, `status='lead'` ou intenção sem passar pelo novo
pipeline e por um ICP ativo. Isso evita transformar coleta temática antiga em
resultado comercial falso.

