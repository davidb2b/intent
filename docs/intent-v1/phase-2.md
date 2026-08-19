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
- orçamento diário atômico de 160 pessoas por projeto, contabilizado por
  tentativa antes de qualquer chamada externa;
- pausa recuperável quando o saldo do plano termina e retomada automática
  quando novos créditos ficam disponíveis.

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

## Cascata do post

A segunda cascata controlada também está concluída:

```text
post qualificado por um sinal aprovado
  -> comentários e reações coletados em paralelo
  -> identidade pública normalizada e deduplicada
  -> enriquecimento regional sem contatos
  -> Brasil literal, fit >= 60 e exclusões privadas
  -> novo perfil interno em `vigiado`
  -> comentário com evidência e data enfileirado para julgamento
  -> novo ICP dispara vigília e futura cascata da empresa
```

Comentários e reações possuem Actors principais e fallbacks independentes.
Resultado vazio válido não aciona fallback. Reações sem data continuam úteis
para descoberta, mas não viram sinal temporal inventado. A expansão é
idempotente por post e versão de ICP, limita a avaliação a dez pessoas por
post e prioriza quem comentou.

## Autor e sugestão de Watchlist

A terceira cascata controlada está concluída:

```text
post expandido
  -> vínculo privado entre post e ICPs aceitos
  -> histórico agregado pelo autor canônico
  -> mínimo de 3 pessoas aderentes distintas
  -> perfil sugerido na Watchlist
  -> aprovação humana obrigatória para acompanhar
```

O vínculo inclui comentários e reações aceitas, permanece inacessível ao
browser e não expõe fit, Actors ou a mecânica da cascata. Um autor descartado
pelo usuário não é reativado pelo motor. A análise não chama provedores e tem
custo externo zero.

## Ciclo recorrente da Watchlist

O ciclo recorrente está publicado e reaproveita a fila já homologada:

```text
fonte V1 aprovada (`pagina` ou `pessoa`)
  -> job `varrer_watchlist` no máximo uma vez a cada 24 horas
  -> posts próprios públicos via Actor sem cookies
  -> normalização de URL, ID público, data e métricas realmente retornadas
  -> dedupe por post e fonte
  -> somente posts inéditos entram em `varrer_post`
  -> comentários, reações, pessoas e contas seguem a cascata existente
```

O Actor recebe uma fonte por execução, aceita URLs de perfil e de página de
empresa e busca no máximo dez posts. Fontes legadas sem tipo de Watchlist não
entram nesse ciclo; também não existe ativação automática de candidatas. O
estado, payload bruto, custo e próxima coleta ficam no backend, fora do browser.
O agendamento verifica fontes de hora em hora e a fila é processada a cada
minuto. Uma fonte V1 de pessoa foi aprovada e enfileirada para a homologação.
Como o teto diário de 160 avaliações já havia sido consumido, o job foi
reagendado automaticamente para o próximo ciclo, sem nova chamada nem custo
externo. A observação da execução completa permanece como gate operacional.

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

A cascata do post foi homologada em produção depois da proteção diária:

- 10 das 160 unidades do ciclo foram reservadas antes dos provedores;
- 4 comentários e 10 reações reais foram normalizados;
- 10 pessoas foram avaliadas e uma nova pessoa brasileira aderente foi aceita;
- zero pessoas fora do Brasil, excluídas ou com fit abaixo de 60 permaneceram;
- nenhum contato privado foi solicitado, persistido ou revelado;
- a execução concluiu por US$ 0,034, gravado no livro interno de custos.

A investigação do autor também foi homologada com dados existentes:

- 28 autores possuíam evidência privada de engajamento aderente;
- um autor atingiu o mínimo de três pessoas distintas em dois posts;
- uma sugestão real foi criada na Watchlist em estado `candidata`;
- nenhuma fonte foi ativada automaticamente;
- nenhuma chamada externa, falha ou custo foi gerado.

Resultados vazios não são convertidos em sinais. Pessoas sem atividade ficam no
radar privado e não aparecem ao cliente.

## Validação automatizada

- testes unitários dos filtros Apollo, validação Brasil, fit, descarte de
  contatos, normalização dos Actors, deduplicação e julgamento estrito;
- teste transacional da fila, lease, idempotência, livro de créditos, teto
  diário e retomada depois de renovação;
- lint do banco remoto sem alertas de schema;
- build, lint e suíte completa do front executados antes da publicação.

## Revelação de contato

O contato não é coletado durante descoberta, enriquecimento ou monitoramento.
Ele só pode ser consultado a partir de uma ação explícita do usuário:

```text
usuário confirma a consulta
  -> ownership da pessoa e do projeto é validado
  -> 1 crédito é reservado de forma atômica
  -> Apollo é chamado apenas para o tipo solicitado
  -> valor criptografado no backend e concessão auditada
  -> crédito é consumido uma única vez e o campo volta apenas ao solicitante
```

Quando o provedor não disponibiliza o dado ou falha, a reserva é estornada. A
mesma pessoa e o mesmo tipo não geram uma cobrança duplicada para o mesmo
usuário. E-mail, telefone, payload do provedor, saldo e histórico privado não
recebem grant de browser.

## Gate restante da Fase 2

O único gate operacional é observar, após a virada do orçamento diário, a
execução paga completa da fonte V1 já aprovada: posts próprios, comentários e
reações, pessoas, contas e deduplicação. Nenhuma proteção de custo foi reduzida
para antecipar esse teste.

Esses blocos reutilizarão a fila e o livro de créditos já homologados. Nenhum
deles deve tornar o radar interno visível nem chamar provedores diretamente do
browser.
