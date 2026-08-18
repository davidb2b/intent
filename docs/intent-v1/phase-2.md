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

## Cascata da empresa

A primeira cascata controlada também está concluída:

```text
empresa materializada por um sinal aprovado
  -> identidade privada confirmada por Apollo ID ou domínio
  -> busca limitada a 5 pessoas da mesma empresa e do ICP ativo
  -> descarte de Apollo IDs já conhecidos antes do enriquecimento
  -> confirmação literal de Brasil e vínculo exato com a empresa
  -> fit privado e exclusões
  -> novo perfil interno em `vigiado`
  -> vigília pública somente quando fit >= 60
```

A expansão é idempotente por empresa e versão de ICP. Ela não consome créditos
do produto, não busca contatos e não torna o radar interno visível.

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

A homologação da cascata executou duas empresas reais em produção:

- as duas buscas responderam com sucesso e concluíram sem erro;
- cada busca encontrou uma pessoa já conhecida daquela empresa;
- os IDs conhecidos foram descartados antes de novo enriquecimento;
- nenhuma pessoa duplicada e nenhum contato foram persistidos;
- o saldo permaneceu em 15 créditos, confirmando custo zero para o cliente;
- as identidades e o estado de expansão continuam restritos ao backend.

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
2. investigação controlada de autores e influenciadores;
3. execução recorrente de watchlists;
4. revelação de contato sob demanda, com consentimento de ação e débito
   específico por tipo de contato.

Esses blocos reutilizarão a fila e o livro de créditos já homologados. Nenhum
deles deve tornar o radar interno visível nem chamar provedores diretamente do
browser.
