# Fase 2 — radar people-first e sinais reais

Status: núcleo vertical implementado e homologado em produção em 18/08/2026.

## Entrega concluída

O primeiro fluxo real do motor está fechado:

```text
ICP ativo
  -> busca de pessoas no Apollo com filtro Brasil
  -> enriquecimento regional literal
  -> radar privado com fit e exclusões
  -> atividade pública recente via Apify
  -> candidato privado com evidência e data
  -> julgamento estruturado
  -> pessoa, conta e sinal visíveis
```

Também foram entregues:

- fila idempotente com prioridade, tentativas, lease e `SKIP LOCKED`;
- execução automática da fila a cada minuto;
- reserva, consumo e estorno atômicos de créditos do produto;
- primários separados para comentários e reações;
- fallback usado somente quando a fonte principal falha ou o perfil está
  indisponível;
- dados brutos, fit, radar, candidatos, auditoria e nomes dos provedores
  restritos ao backend;
- descarte recursivo de e-mail e telefone retornados por enriquecimento;
- julgamento com schema estrito, regra pertencente ao ICP ativo e evidência
  literal preservada;
- materialização da empresa somente depois da aprovação do sinal;
- distinção entre ausência legítima de atividade, perfil indisponível e falha
  do provedor.

## Homologação real

A execução de produção usou um ICP ativo e concluiu toda a fila sem erro:

- 5 pessoas encontradas e confirmadas literalmente no Brasil;
- 5 pessoas com nome válido e fit mínimo de 85;
- nenhum contato privado persistido;
- 5 verificações de atividade concluídas;
- 11 julgamentos concluídos;
- 11 sinais reais com evidência literal preservada;
- 3 pessoas e 3 empresas materializadas a partir dos sinais;
- 3 créditos consumidos, um por pessoa julgada e não por atividade;
- nenhuma tabela operacional acessível a `anon` ou `authenticated`.

Resultados vazios não são convertidos em sinais. Pessoas sem atividade ficam no
radar privado e não aparecem ao cliente.

## Validação automatizada

- testes unitários dos filtros Apollo, validação Brasil, fit, descarte de
  contatos, normalização dos Actors, deduplicação e julgamento estrito;
- teste transacional da fila, lease, idempotência e livro de créditos;
- lint do banco remoto sem alertas de schema;
- build, lint e suíte completa do front executados antes da publicação.

## Próximo bloco da Fase 2

O núcleo está homologado. Ainda pertencem à Fase 2, mas serão implementados em
blocos separados para preservar controle de custo e isolamento de falhas:

1. cascata do post para descobrir outras pessoas que interagiram;
2. cascata da empresa para ampliar o radar na mesma conta;
3. investigação controlada de autores e influenciadores;
4. execução recorrente de watchlists;
5. revelação de contato sob demanda, com consentimento de ação e débito
   específico por tipo de contato.

Esses blocos reutilizarão a fila e o livro de créditos já homologados. Nenhum
deles deve tornar o radar interno visível nem chamar provedores diretamente do
browser.
