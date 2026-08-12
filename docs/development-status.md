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

## Próximo gate

Executar uma coleta autenticada com uma palavra-chave real. Depois devemos
confirmar posts, comentários, execução e custo no banco, e então seguir para a
separação formal entre descoberta e monitoramento do PR2.
