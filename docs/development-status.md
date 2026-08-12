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

## Em andamento

- Publicação da Edge Function `start-collection`.
- Cadastro do `APIFY_TOKEN` nos secrets do Supabase.
- Primeiro teste integrado autenticado com coleta real.

## Bloqueio atual

Na conta Supabase atualmente conectada, `Edge Functions`, `Functions`, `Secrets`
e `Deploy a new function` aparecem desabilitados. O endpoint confirma que a
função ainda não foi publicada (`404 Requested function was not found`).

Isso indica falta de permissão/escopo para gerenciar Edge Functions nessa conta
ou projeto. A migration e o banco estão operacionais; o bloqueio está apenas
na camada de execução server-side e secrets.

## Próximo gate

Conceder à conta utilizada no Supabase permissão de gerenciamento de Edge
Functions, ou conectar uma conta/projeto em que o deploy esteja habilitado.
Depois disso, publicar a função, cadastrar o secret e executar uma coleta
autenticada com uma palavra-chave real. Só após esse teste o PR2 será marcado
como concluído.
