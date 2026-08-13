# Status atual do desenvolvimento

## Concluído

- Passo 0: validação real dos Actors e amostras salvas.
- Fundação Vite + React + TypeScript + Bun.
- shadcn/ui, Tailwind e layout inicial baseado no HTML do cliente.
- Sidebar e cinco áreas do produto.
- Configuração de pesquisa com palavra-chave e contextos.
- Autenticação inicial com Supabase Auth no front-end.
- Migration aplicada no projeto Supabase `ppsusbybtkcjccwvysvk`.
- RLS configurado para separar os dados por `owner_id`.
- Token dedicado criado na Apify para o backend.
- Testes unitários, build e lint validados.
- PR1 fechado no front-end: sessão persistida, rotas reais, logout, recuperação
  de senha e atualização de senha via Supabase Auth.

## Auditoria da Fase 0 — concluída

- O stack foi alinhado à spec: React e React DOM fixados na versão 18.3.1,
  com tipos React 18.
- Branch de trabalho criada para respeitar o fluxo de branch/PR/preview; não
  haverá novas entregas diretamente em `main`.
- Testes, build e lint foram executados após o alinhamento do stack.
- As amostras reais dos Actors estão versionadas em `docs/amostras/` e não
  contêm credenciais.
- Pendente: mover a aplicação para a organização por features/services
  definida em `docs/architecture.md`.
- Pendente: confirmar com David se `owner_id` deve permanecer na tabela
  `projetos`. A spec publicada não declara essa coluna, mas o RLS atual e o
  login usam esse vínculo. A migration não será alterada sem resolver essa
  divergência.
- A aplicação foi reorganizada por domínio em `src/features`, com auth,
  research, collection, classification, posts e analytics separados.
- A UI não importa mais o client do Supabase diretamente; autenticação e
  persistência da pesquisa usam services próprios.
- A validação controlada do Actor de perfil retornou um perfil com país `BR` e
  outro com país `UA`; a regra de origem aceita o primeiro e rejeita o segundo,
  com teste automatizado e amostra mínima versionada.
- A rotação da chave OpenAI exposta foi adiada pelo responsável do projeto e
  permanece como risco de segurança conhecido; o valor segue exclusivamente no
  secret do Supabase e não está no repositório.

## Fase 1 — configuração da pesquisa

- O modal salva projeto, termo e contextos no Supabase somente quando existe
  sessão autenticada.
- Salvar a configuração não dispara Actor nem cria execução.
- Palavra-chave e contextos são normalizados no service, com teste unitário.
- A decisão temporária é manter `owner_id` para preservar o isolamento de
  autenticação/RLS até a revisão da divergência com a spec.

## Fase 2 — descoberta de fontes

- A identidade de pessoas foi centralizada em
  `supabase/functions/_shared/profile-identity.ts`.
- Descoberta, monitoramento e coleta legada agora usam a mesma normalização
  de slug, evitando duplicatas por maiúsculas, barra final ou query string.
- Teste unitário cobre URLs canônicas e duas pessoas com slugs diferentes.
- As Edge Functions `discover-sources`, `run-monitoring` e
  `start-collection` foram republicadas.
- As três funções continuam protegidas: chamadas sem sessão retornam `401`.

## Fase 5 — controle de custos

- Criado controle compartilhado de custo para as Edge Functions.
- Teto padrão por execução: US$ 15,00.
- Teto mensal: US$ 300,00.
- A próxima chamada é estimada antes de ser enviada ao Apify.
- Execuções que atingem o limite são gravadas como
  `abortada_por_custo` e não continuam novas chamadas.
- O custo real continua sendo registrado por Actor em `custos`.
- A descoberta e o monitoramento foram republicados com essa proteção.
- Testes unitários cobrem a estimativa de comentários e o corte do teto por
  execução.
- Ainda falta testar o abortamento contra uma execução autenticada real com
  teto reduzido para US$ 0,50, conforme o checklist do David.
- A barra de coleta agora mostra próxima execução, estimativa calculada a
  partir das fontes monitoradas e status da última rodada.
- A sidebar agora mostra gasto mensal, barra de consumo e aviso a partir de
  75% do teto.
- A Visão geral agora mostra histórico real de execuções, origem, status,
  contadores e custo.

## Fase 6 — agendamento

- O `run-monitoring` agora aceita um caminho agendado protegido exclusivamente
  pelo secret `SCHEDULER_SECRET` no header `x-scheduler-secret`.
- Execuções por esse caminho são registradas com `origem: "agendada"` e não
  dependem de um usuário fictício.
- O contrato e os passos para configurar o cron de segunda-feira às 06:00 BRT
  estão em `docs/scheduling.md`.
- `SCHEDULER_SECRET` já foi cadastrado no projeto Supabase sem expor o valor.
- As extensões `pg_cron` e `pg_net` foram habilitadas; URL, chave pública e
  secret do agendador foram armazenados no Supabase Vault.
- O job `signal-lab-weekly-monitoring` está ativo com `0 9 * * 1` (segunda,
  06:00 BRT) e usa o único projeto Signal Lab hoje cadastrado.
- A rota foi validada com o secret do agendador e respondeu `404` para um
  projeto inexistente, confirmando que a autenticação do cron está protegida;
  a primeira execução real será registrada no próximo horário programado.

## Concluído nesta etapa

- Permissão de gerenciamento liberada na organização `B2B Insiders Pro`.
- Secret `APIFY_TOKEN` criado no Supabase, sem expor o valor no repositório.
- Edge Function `start-collection` publicada.
- Validação JWT antiga desativada no gateway; a própria função valida a sessão
  autenticada com `auth.getUser()`.
- Endpoint verificado sem sessão: retorna `401` com `Faça login para iniciar
  uma coleta.` Isso confirma que a função está publicada e protegida.

## PR2 iniciado

- A Edge Function agora registra o custo individual de cada Actor em `custos`.
- A coleta de comentários só é disparada para posts que informam comentários.
- O contador de posts representa registros persistidos, e não apenas itens
  retornados pelo Actor.
- JSON inválido e execução concorrente do mesmo projeto são rejeitados.
- A versão atualizada foi publicada e o endpoint sem sessão continua retornando
  `401`.
- O front-end passou a ler o resumo persistido do projeto autenticado e exibir
  contagens reais de posts, comentários, pessoas e empresas.
- Primeira coleta real validada em produção com `cost breakdown`: 5 posts, 9
  comentários e custo de `$0.012`.
- O contrato do Actor foi normalizado para `author`, `content` e
  `postedAt.date`, evitando falhas silenciosas de persistência.
- A coleta passa a aceitar somente autores e comentaristas com localização
  brasileira confirmada pelo Actor `apimaestro/linkedin-profile-detail`.
  Perfis fora do Brasil ou sem localização confirmada são descartados antes
  da persistência.

## PR3 iniciado

- Edge Function republicada com a validação brasileira ativa.
- Classificação determinística de senioridade e ICP criada como função pura,
  separada da coleta e da futura classificação por IA.
- Comentários agora preservam o texto integral na tela e exportam CSV com
  separador `;` e BOM UTF-8.
- Confiança abaixo de 0,6 já possui marca visual de revisão quando existir no
  banco.
- Edge Function `classify-comments` publicada com lotes de até 40 comentários,
  temperatura 0, validação de categorias/IDs/confiança e proteção contra
  sobrescrever revisão humana.
- O contrato da resposta da OpenAI foi corrigido para o objeto JSON
  `resultados`; a primeira classificação real foi validada com 9 comentários
  classificados e zero pendentes.
- A função exige o secret `OPENAI_API_KEY` no backend; sem ele responde `503`
  explicitamente.
- Edge Function `analyze-posts` publicada e validada com 1 post analisado e 4
  posts ainda pendentes.

## Auditoria de origem dos dados

- As coletas novas foram testadas com `cost breakdown`, `cost breakdown Brasil`
  e `procurement`: nenhuma inseriu post estrangeiro.
- A estratégia Brazil-first foi publicada usando
  `harvestapi/linkedin-profile-search` com `locations: ["Brazil"]` e
  `harvestapi/linkedin-profile-posts`, mas o Actor retornou zero perfis mesmo
  para `procurement`; a captura brasileira ainda está bloqueada por esse
  contrato/resultado do Actor.
- A limpeza do projeto de teste foi executada; os posts/comentários antigos
  estrangeiros foram removidos. O projeto está sem dados de produção até uma
  coleta brasileira ser validada.
- O diagnóstico final do bloqueio foi o limite diário gratuito do Apify para
  perfis. A Edge Function agora retorna esse motivo explicitamente, em vez de
  tratar a resposta como zero perfis.
- A verificação de localização foi preparada para usar
  `harvestapi/linkedin-profile-scraper` em lote limitado a 25 autores, com
  correspondência obrigatória da URL canônica e `apimaestro` como fallback.
  A validação com uma fonte brasileira real continua pendente enquanto a conta
  Apify não permitir a leitura de perfis.
- O payload de localização do Actor de perfil foi corrigido para ler
  `basic_info.location.country_code` e `basic_info.location.country`.
- Edge Function `discover-sources` publicada com o contrato separado de
  descoberta: busca posts sem comentários/reactions, agrupa autores, calcula
  a razão comentários/reactions e grava somente perfis brasileiros novos em
  `fontes` como `candidata`. Fontes já existentes, inclusive descartadas, não
  são recriadas.
- Edge Function `run-monitoring` publicada com o contrato de monitoramento:
  lê somente fontes `monitorada`, usa janela `month` por padrão, atualiza
  posts por `post_urn`, coleta comentários sem replies, valida comentaristas
  brasileiros, deduplica pessoas por slug e comentários por URN, e registra
  cada chamada de Actor em `custos`.

## PR3 — curadoria manual

- Tela de Posts agora permite aprovar ou descartar cada post.
- A revisão segue o HTML de referência com lista de resultados à esquerda e
  painel de detalhe do post selecionado à direita.
- A decisão é persistida diretamente no Supabase com RLS do proprietário.
- O status de curadoria fica visível e é atualizado sem dados mockados.
- A análise automática continua apenas como sugestão; a decisão humana é a
  que controla o status do post.
- Tela de Posts alinhada ao HTML de referência com alternador entre
  `Resultados da busca` e `Perfis monitorados`, usando somente registros reais
  de `posts` e `fontes`.
- Barra de coleta separada em `Descobrir fontes` e `Atualizar agora`; salvar a
  configuração agora persiste projeto e termo no Supabase antes de permitir
  as ações.

## PR4 — telas de análise

- Tela de Posts alinhada ao protótipo com lista/detalhe e modo `Perfis
  monitorados`.
- Tela de Empresas passou a ler `empresas`, pessoas observadas e comentários
  reais do Supabase, consolidando comentários por conta.
- Tela de Pessoas passou a ler `pessoas` e comentários reais, com filtros
  `Todas`, `Dentro do ICP` e `Fora ou pendentes`.
- Estados vazios continuam sem dados fictícios quando ainda não existe coleta.

## Próximo gate

Executar uma descoberta autenticada quando o limite do Apify permitir, validar
as fontes brasileiras candidatas e testar o fluxo com uma fonte brasileira
aprovada. Depois faltam o agendamento semanal, teto de custo, histórico de
execuções na interface e refinamento final de paridade visual com o HTML.
