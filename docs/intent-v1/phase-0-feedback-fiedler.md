# Fase 0 — baseline do feedback real do David

Status: em execução

Esta fase organiza o feedback do primeiro teste real com `fiedler.com.br`.
Ela complementa a Fase 0 histórica da fundação e não reabre migrations nem
cria uma nova versão visual do Intent.

## Objetivo

Estabelecer uma linha de base reproduzível antes das correções de firmografia,
cargos, placeholders, custo interno e telas do motor. Toda correção posterior
deve ser comparada com esta matriz e passar por preview, teste do David e
aceite antes do merge em `main`.

## Regras desta fase

- Nenhum dado de produção será apagado, reclassificado ou substituído por mock.
- Fixtures podem ser anonimizadas e servem somente para testes automatizados.
- O site real do cliente e os dados públicos reais são a fonte de homologação.
- O browser nunca chama Apollo, Apify ou o provedor de IA diretamente.
- Ausência de dado continua sendo ausência; o pipeline não pode completar
  informação por inferência apresentada como fato.
- Cada item de correção será desenvolvido em branch própria e publicado em
  preview antes de entrar na `main`.

## Linha de base técnica

- [x] `src/app/App.tsx` direciona usuários autenticados para o workspace V1.
- [x] `IntentV1Workspace` possui as áreas Início, Pessoas, Contas,
  Watchlist e classificação.
- [x] Pessoas preserva evidência pública literal e drawer de detalhes.
- [x] Watchlist possui decisão de Aprovar/Descartar.
- [x] O backend registra custo real em `custos` e `execucoes`.
- [ ] Confirmar em produção, com a conta do David, que o deploy atual não
  apresenta o shell legado com telas “Em breve”.
- [ ] Confirmar o ciclo real da Watchlist após a virada do orçamento diário.

### Registro do baseline — 20/08/2026

- Suíte automatizada: 36 arquivos e 143 testes aprovados.
- Lint: aprovado.
- Build de produção: aprovado; permanece apenas o alerta não bloqueante de
  bundle JavaScript acima de 500 kB.
- Git: árvore limpa antes da criação desta branch.
- Smoke test autenticado: pendente, porque nenhuma aba autenticada do Chrome
  está conectada nesta execução. Não foi feita leitura de dados privados nem
  foi considerada a tela de produção como validada por inferência.

## Matriz de aceite

| Cenário | Entrada | Resultado esperado | Evidência de aceite |
|---|---|---|---|
| Fiedler industrial | `https://fiedler.com.br` | Firmografia real, cargos ligados às dores industriais e setores coerentes | ICP regenerado, payload de execução e tela de revisão |
| Contra-teste SaaS | Site SaaS real autorizado para homologação | Cargos de tecnologia aparecem quando o contexto justificar | ICP regenerado sem lista fixa de cargos |
| Placeholders | Empresa sem algum dado público | Campo ausente permanece vazio ou não confirmado na firmografia | Nenhum chip `Outros` ou `desconhecido` no comprador |
| Telas do motor | ICP ativo com sinais reais | Pessoas, contas e Watchlist exibem dados reais e evidência literal | Smoke test autenticado no preview e em produção |
| Custo interno | Admin e usuário não-admin | Custo USD só aparece para admin; cliente vê somente créditos | Teste de autorização e screenshot de cada papel |
| Fonte recorrente | Fonte V1 aprovada | Posts inéditos, interações, pessoas, contas e deduplicação | Execução completa registrada sem duplicação |

## Contratos que serão congelados antes da implementação

1. **Firmografia:** a resolução da company page seguirá site → Google com
   variações → busca por nome/domínio no Actor.
2. **Comprador:** cargos serão derivados das dores e do contexto da empresa;
   exemplos de software não podem funcionar como sugestão fixa.
3. **Comprador versus firmografia:** `outros` e `desconhecido` não serão
   válidos como chips do comprador. `desconhecido` pode continuar na
   firmografia quando a fonte pública não confirmar o dado.
4. **Custo:** `costUsd` será exibido somente na revisão do ICP para o papel
   administrativo autorizado.
5. **Motor:** só aparecem no workspace pessoas que passaram pelo ICP e têm
   sinal aprovado; a evidência exibida deve ser literal.

## Entregas da Fase 0

- [x] Branch própria criada para esta rodada de correções.
- [x] Feedback do David convertido em critérios verificáveis.
- [x] Cenário Fiedler e contra-teste SaaS definidos.
- [x] Limites de segurança e dados reais registrados.
- [x] Executar baseline automatizado da `main`.
- [ ] Executar smoke test autenticado do workspace publicado.
- [ ] Registrar o resultado do gate operacional da Watchlist.
- [ ] Liberar a Fase 1 de implementação das telas e do fluxo de dados.

## Saída da fase

A Fase 0 termina quando a linha de base automatizada, o smoke test autenticado
e o estado do ciclo recorrente estiverem registrados. A partir daí, as
correções entram nesta ordem: telas do motor, resolução da company page,
derivação de cargos, remoção de placeholders e custo interno.
