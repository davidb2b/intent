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

Status: **contrato documental aprovado; acesso real pendente**.

## Apify — atividade da pessoa

| Papel | Actor | Evidência pública | Decisão atual |
|---|---|---|---|
| Primário — comentários | `harvestapi/linkedin-profile-comments` | Sem cookie, comentários feitos pelo perfil, post completo, US$ 2/1.000, 5.0, 317 usuários mensais | Candidato A1; precisa run real |
| Primário — reações | `harvestapi/linkedin-profile-reactions` | Confirmado na organização Apify: sem cookie, post completo, US$ 2/1.000, 4.7 (10), 1.1K usuários | Candidato A2; precisa run real |
| Fallback combinado | `unseenuser/linkedin-user-comments-reactions` | Sem cookie, comentários/reactions/both, janela de data, US$ 5/1.000, 5.0 (5), 104 usuários mensais | Candidato B; precisa run real |
| Reserva experimental | `iron-crawler/linkedin-profile-activity-scraper` | Sem cookie, quatro tipos, US$ 15/1.000, sem avaliações e baixo uso | Não usar antes de PoC específica |
| Rejeitado | `crawlerbros/linkedin-user-activity-scraper` | Exige `li_at` e proxy residencial recomendado | Proibido pela arquitetura |

Estratégia de homologação:

1. usar os mesmos três perfis brasileiros em A1, A2 e B;
2. limite de 5 comentários por perfil e janela de uma semana/mês;
3. comparar identidade, texto literal, post URL/URN, autor, timestamp e vazio;
4. medir latência e custo real do run;
5. repetir um perfil para comprovar dedupe;
6. simular falha de A1/A2 e verificar que B mantém o contrato normalizado;
7. se reações de A2 e B forem incompletas, liberar a V1 primeiro com comentários
   fortes e manter reações como sinal fraco pendente, sem fabricar ausência.

O acesso à organização `B2B Insiders_Serviço` foi confirmado no perfil correto
do Chrome. A conta exibe a dupla HarvestAPI e permite configurar os limites de
itens, mas os runs de homologação ainda não foram disparados.

Status: **shortlist definida; nenhum Actor novo homologado ainda**.

## Apify — cascata do post

| Operação | Primário | Fallback | Estado |
|---|---|---|---|
| Comentários do post | `harvestapi/linkedin-post-comments` | `apimaestro/linkedin-post-comments-replies-engagements-scraper-no-cookies` | Primário já usado pelo legado; revalidar para novo DTO |
| Reações do post | `harvestapi/linkedin-post-reactions` | Nenhum aprovado | Shortlist; homologação pendente |
| Perfil detalhado | `harvestapi/linkedin-profile-scraper` | `apimaestro/linkedin-profile-detail` | Contrato legado disponível; preservar campos ausentes |
| Posts do influenciador | `harvestapi/linkedin-profile-posts` | Nenhum aprovado | Candidato; não confundir posts próprios com atividade feita |

## Onboarding

| Fonte | Primário | Fallback | Estado |
|---|---|---|---|
| Site | `apify/website-content-crawler` com Cheerio | mesmo Actor com Playwright Firefox | PoC declarada na spec; fixture precisa entrar no repo |
| Google | `apify/google-search-scraper` | erro explícito e reexecução | PoC declarada; fixture pendente |
| Company LinkedIn | `sourabhbgp/linkedin-company-scraper` | `harvestapi/linkedin-company` | PoC declarada; comparar contratos |

## LLM

Três contratos diferentes no onboarding e um no julgamento. Nunca usar resposta
livre como fonte direta de persistência. Cada operação deve ter:

- JSON Schema versionado;
- enum fechado onde a busca depende do valor;
- timeout e máximo de tentativas;
- validação de provas literais;
- modelo, tokens, custo, latência e versão do prompt;
- erro de schema separado de erro do provedor.

## Secrets necessárias

- `APIFY_TOKEN`: existente no backend legado;
- `OPENAI_API_KEY`: existente no backend legado;
- `APOLLO_API_KEY`: pendente;
- `SCHEDULER_SECRET`: existente no backend legado.

Valores nunca devem ser copiados para documentação, fixture, front ou logs.
