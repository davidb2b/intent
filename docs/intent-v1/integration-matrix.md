# Matriz de integrações — Fase 0

Última revisão documental: 18/08/2026.

## Apollo

Endpoint oficial: `POST https://api.apollo.io/api/v1/mixed_people/api_search`.

Contrato confirmado na documentação:

- acesso requer escopo `mixed_people_api_search` ou Master API key;
- busca custa 0 créditos Apollo;
- até 100 registros por página, 500 páginas e 50.000 exibidos;
- suporta cargos, senioridade, localização pessoal, localização da empresa,
  domínios, IDs de empresa e faixas de funcionários;
- busca não devolve e-mail nem telefone; isso exige enrichment separado;
- limites de requisição dependem do plano e devem ser lidos da conta real;
- HTTP 429 é retryable com backoff e respeito ao reset.

Homologação real de 18/08/2026:

- chave dedicada inicial criada para `mixed_people/api_search`;
- `auth/health` respondeu HTTP 200 com `healthy=true` e `is_logged_in=true`;
- busca com `person_locations=["Brazil"]`, três cargos e `per_page=5`
  respondeu HTTP 200 com cinco pessoas;
- limites observados nos headers: 200/minuto, 6.000/hora e 50.000/24 horas;
- o retorno expõe nomes parcialmente ofuscados e indicadores de disponibilidade,
  mas não devolve e-mail, telefone nem o país literal;
- uma segunda chave de escopo mínimo foi criada para
  `mixed_people/api_search` + `people/match` e substituiu o secret
  `APOLLO_API_KEY` no Supabase;
- uma pessoa da amostra filtrada foi enriquecida por Apollo ID com e-mail
  pessoal, telefone e waterfalls explicitamente desabilitados;
- o enriquecimento respondeu `country="Brazil"` literalmente, consumiu
  1 crédito Apollo e todo campo de contato eventualmente presente foi
  descartado sem entrar na fixture;
- a evidência anonimizada está em
  `fixtures/apollo-regional-enrichment-homologation.json`.

Status: **People Search e validação regional literal aprovados. A etapa de
enriquecimento continua obrigatória antes de ativar uma pessoa no radar**.

### Apollo — cascata da empresa

O worker usa `organization_ids` como filtro prioritário e domínio confirmado
como fallback. A busca mantém localização da pessoa e da empresa em `Brazil`,
remove a faixa de porte por já estar dentro de uma empresa exata e limita cada
expansão a cinco resultados. IDs já presentes no projeto são descartados antes
do endpoint de enriquecimento.

Na homologação de produção, duas empresas retornaram somente a pessoa que já
havia originado o sinal. As execuções concluíram sem duplicar pessoas, sem novo
enriquecimento, sem contatos e sem movimento no livro de créditos do produto.

## Apify — atividade da pessoa

| Papel | Actor | Evidência pública | Decisão atual |
|---|---|---|---|
| Primário — comentários | `harvestapi/linkedin-profile-comments` | Run real: 8 itens, 27 s, US$ 0,016; preserva comentário, identidade, timestamp, URL e conteúdo do post | **Aprovado** |
| Primário — reações | `harvestapi/linkedin-profile-reactions` | Run real: 11 itens, 27 s, US$ 0,022; preserva ação, identidade, timestamp, URL e conteúdo do post | **Aprovado** |
| Fallback combinado | `unseenuser/linkedin-user-comments-reactions` | Run real: 19 itens, 16 s, US$ 0,095; não entrega timestamp, URL nem conteúdo do post | **Rejeitado para produção** |
| Fallback degradado | `scraping_solutions/linkedin-profile-comments-reactions-scraper-no-cookies` | Run real: 41 itens, 30 s, US$ 0,057; preserva tipo, perfil, data, evidência e URL do post, mas omite timezone, texto separado e autor do post | **Aprovado com restrições** |
| Reserva experimental | `iron-crawler/linkedin-profile-activity-scraper` | Sem cookie, quatro tipos, US$ 15/1.000, sem avaliações e baixo uso | Não usar antes de PoC específica |
| Rejeitado | `crawlerbros/linkedin-user-activity-scraper` | Exige `li_at` e proxy residencial recomendado | Proibido pela arquitetura |

Resultado da homologação de 18/08/2026:

1. os mesmos três perfis públicos brasileiros foram usados nos quatro runs;
2. os três primeiros runs usaram 5 itens por perfil; o substituto impôs mínimo
   de 20, sempre com janela de um mês;
3. a dupla HarvestAPI retornou 19 itens por US$ 0,038 no total;
4. um perfil sem comentários retornou zero de forma válida, enquanto ainda
   apresentou uma reação — ausência de comentário não foi tratada como falha;
5. o fallback retornou mais itens, mas seu contrato real possui somente
   `action`, `comment_text`, `source_profile` e `page_number`;
6. sem URL/conteúdo do post e sem timestamp, o fallback não sustenta evidência,
   recência, dedupe nem julgamento auditável e, portanto, foi rejeitado;
7. o fallback substituto retornou 41 itens, sem duplicatas, por US$ 0,057;
8. o substituto exige mínimo de 20 itens por perfil, e o modo `both` pode deixar
   um tipo consumir todo o limite; produção deve chamá-lo separadamente por tipo;
9. `eventDate` não informa timezone, e `postText`/autor do post não vieram no
   output real. O adaptador deve preservar essa parcialidade explicitamente;
10. a localização Brasil não vem desses payloads. A elegibilidade regional deve
   ser comprovada antes do enfileiramento por Apollo ou enriquecimento de perfil.
11. o teste de perfil inexistente mostrou que o primário pode concluir
    `SUCCEEDED` com zero itens e diagnóstico `No valid source provided`;
12. o fallback concluiu `SUCCEEDED/PARTIAL`, entregou um item `error` e custou
    US$ 0,001. O status normalizado correto nos dois casos é
    `profile_unavailable`, não `no_activity`.

As métricas e a cobertura anonimizada estão versionadas em
`fixtures/profile-activity-homologation.json`. Os outputs brutos permanecem na
Apify e não foram copiados para o Git por conterem dados pessoais públicos.

Status: **dupla primária homologada e fallback degradado aprovado com contrato
mais restrito**.

## Apify — atividade da pessoa em produção

O worker `process-intent-jobs` usa a dupla HarvestAPI como fonte principal. O
fallback aprovado é chamado somente quando a fonte principal falha ou identifica
perfil indisponível. Resultado vazio válido permanece `no_activity` e não aciona
o fallback nem cria sinal artificial.

## Apify — cascata do post

| Operação | Primário | Fallback | Estado |
|---|---|---|---|
| Comentários do post | `harvestapi/linkedin-post-comments` | `apimaestro/linkedin-post-comments-replies-engagements-scraper-no-cookies` | **Aprovado**; preserva autor, comentário, data e URL pública |
| Reações do post | `harvestapi/linkedin-post-reactions` | `apimaestro/linkedin-post-reactions` | **Aprovado para descoberta**; ausência de data não vira sinal temporal |
| Perfil detalhado | `harvestapi/linkedin-profile-scraper` | `apimaestro/linkedin-profile-detail` | Contrato legado disponível; preservar campos ausentes |
| Posts próprios da Watchlist | `harvestapi/linkedin-profile-posts` | Nenhum aprovado | **Aprovado** para perfil e página; no máximo 10 posts por fonte, somente após aprovação humana |

Homologação real da cascata em 18/08/2026:

- chamada limitada a dez resultados por tipo e até dez pessoas por post;
- comentários priorizados sobre reações na seleção para enriquecimento;
- Apollo `people/match` chamado somente com URL pública e com e-mail, telefone
  e waterfalls desabilitados;
- 4 comentários, 10 reações e 10 pessoas avaliadas no run controlado;
- uma pessoa nova aceita após Brasil literal e fit mínimo; zero registros
  inválidos e zero contatos persistidos;
- custo real de US$ 0,034;
- orçamento diário reservado antes dos Actors e registrado em tabela privada.

## Autor e Watchlist

A qualificação inicial do autor não usa um novo provedor. Ela agrega somente
vínculos de engajamento já aceitos pelo filtro Brasil/ICP e cria uma sugestão
de pessoa quando existem três engajadores distintos. O caso real homologado
gerou uma sugestão a partir de três pessoas em dois posts, com custo externo
zero. A coleta de posts próprios começa apenas depois da aprovação humana. O
ciclo publicado chama `harvestapi/linkedin-profile-posts` com uma única URL de
perfil ou página e máximo de dez posts; comentários e reações permanecem
desligados nessa etapa. O adaptador exige ID público estável, preserva somente
campos que o Actor devolve e envia apenas posts inéditos à cascata `varrer_post`.
A última homologação pendente é observar uma execução paga de uma fonte V1
aprovada.

## Onboarding

| Fonte | Primário | Fallback | Estado |
|---|---|---|---|
| Site | `apify/website-content-crawler` com Cheerio | mesmo Actor com Playwright Firefox | PoC declarada na spec; fixture precisa entrar no repo |
| Google | `apify/google-search-scraper` | erro explícito e reexecução | PoC declarada; fixture pendente |
| Company LinkedIn | `sourabhbgp/linkedin-company-scraper` | `harvestapi/linkedin-company` | PoC declarada; comparar contratos |

## LLM

Três contratos diferentes no onboarding e um no julgamento. Nunca usar resposta
livre como fonte direta de persistência. Cada operação possui:

- JSON Schema versionado com `strict=true` e `additionalProperties=false`;
- enum fechado onde a busca depende do valor;
- timeout e máximo de tentativas;
- validação de provas literais;
- modelo, tokens, custo, latência e versão do prompt;
- erro de schema separado de erro do provedor.

Modelos congelados na Fase 0:

- perfil da empresa e comprador: `gpt-5.4-nano-2026-03-17`;
- sinais de compra: `gpt-5.4-mini-2026-03-17`;
- julgamento: `gpt-5.4-nano-2026-03-17`.

Os três schemas aceitaram a PoC real de 5by5 e rejeitaram campos adicionais,
taxonomias abertas, região fora do Brasil, contagens inválidas e provas sem
fonte. Configuração, custo e testes estão em `llm-contracts.md`.

## Secrets necessárias

- `APIFY_TOKEN`: existente no backend legado;
- `OPENAI_API_KEY`: existente no backend legado;
- `APOLLO_API_KEY`: existente no backend desde 18/08/2026;
- `SCHEDULER_SECRET`: existente no backend legado.

Valores nunca devem ser copiados para documentação, fixture, front ou logs.
