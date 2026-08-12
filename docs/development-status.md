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

## Próximo gate

Executar uma descoberta autenticada quando o limite do Apify permitir, validar
as fontes brasileiras candidatas e então implementar `rodar-monitoramento` para
ler somente fontes aprovadas como `monitorada`. A descoberta e o monitoramento
já estão separados no backend; falta agora expor as duas ações de forma
explícita na tela e testar o fluxo com uma fonte brasileira aprovada.
