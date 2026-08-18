# Intent v1 — plano vigente

Status: Fases 0 e 1 encerradas; núcleo vertical e cascatas de empresa e post da Fase 2 homologados em produção

Branch: `main`
Fontes de verdade: SPEC Intent v1, motor people-first v2 e protótipo v7.3.

## Objetivo do produto

O Intent responde: **quem é do perfil de cliente ideal e está em momento de
compra agora?**

O usuário define o ICP a partir do site da própria empresa. O motor cria um
radar interno de pessoas aderentes, observa sinais públicos de comportamento e
mostra somente pessoas que são ICP e produziram evidência de intenção.

## Fluxo canônico

```text
site do cliente
  -> ICP editável e versionado
  -> ativação
  -> semente de pessoas no Apollo
  -> radar interno invisível
  -> atividade pública recente via Apify
  -> higiene + fit interno + julgamento de intenção
  -> pessoas, contas e watchlist visíveis
  -> cascatas controladas por fila e créditos
```

O fluxo anterior `palavra-chave -> posts -> comentários` passa a ser legado. A
busca temática poderá existir como complemento, nunca como coração do motor.

## Regras fechadas

- Browser nunca chama Apollo, Apify ou LLM.
- O radar, o fit, as cascatas e os nomes de Actors nunca aparecem ao cliente.
- O front padrão lista somente `lead`, `sinal_fraco` e `cliente`.
- `fora_icp` aparece apenas na visão de auditoria "Todas".
- Contato é revelado sob demanda e debitado de forma atômica.
- Evidência é literal; ausência de dado não pode virar dado inventado.
- Créditos do cliente e custo real em USD são livros separados.
- Jobs são idempotentes, retomáveis e isolam falhas por item.
- A V1 começa no Brasil e deve aplicar região tanto na busca quanto na
  validação de dados retornados.
- Nenhuma dependência com Golden Dog.
- Nada ativa o novo motor para usuários sem preview, validação automatizada e
  aceite de produto do David.

## Fases vigentes

| Fase | Entrega | Estado | Gate |
|---|---|---|---|
| 0 | Contratos, arquitetura, integrações e estratégia de migração | Encerrada | migrations `0009`/`0010`, RLS, testes e banco remoto validados |
| 1 | Onboarding site -> ICP editável/versionado | Encerrada | ICP real gerado, editado, versionado e ativado em produção |
| 2 | Radar people-first, fila, julgamento, créditos e cascatas | Em andamento | núcleo e cascatas de empresa/post homologados; autor, watchlists e contatos ainda pendentes |
| 3 | Início, Pessoas, Contas, Watchlist, ICP e classificação | Não iniciada | protótipo v7.3 com dados reais e sem conceitos internos |
| 4 | Hardening, observabilidade, segurança e homologação final | Não iniciada | smoke em produção, RLS, custos e recuperação de falhas |

## Documentos desta fase

- [`phase-0.md`](phase-0.md): execução, gates e pendências.
- [`phase-2.md`](phase-2.md): motor people-first, homologação real e próximos blocos.
- [`architecture.md`](architecture.md): fronteiras, componentes e fluxo.
- [`domain-contracts.md`](domain-contracts.md): vocabulário e invariantes.
- [`integration-matrix.md`](integration-matrix.md): Apollo, Apify e LLM.
- [`llm-contracts.md`](llm-contracts.md): schemas estritos, modelos e custo.
- [`private-data-rls.md`](private-data-rls.md): dados privados, grants e RLS.
- [`migration-strategy.md`](migration-strategy.md): evolução sem perda de dados.

## Próximo gate

O próximo bloco implementa a investigação controlada do autor do post. Ele
precisa promover somente autores que atraíram três ou mais ICPs, criar uma
sugestão de watchlist para aprovação humana e preservar idempotência,
isolamento por projeto e o orçamento diário já homologado.
