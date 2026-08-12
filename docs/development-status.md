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
- A função está aguardando apenas o secret `OPENAI_API_KEY` para executar a
  classificação real; sem ele responde `503` explicitamente.

## Próximo gate

Executar uma coleta autenticada com uma palavra-chave real. Depois devemos
confirmar posts, comentários, execução e custo no banco, e então seguir para a
separação formal entre descoberta e monitoramento do PR2.
