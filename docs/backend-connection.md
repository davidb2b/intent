# Conexão do backend

## O que já está conectado

- O front-end usa o client oficial do Supabase com a URL e publishable key do
  projeto `ppsusbybtkcjccwvysvk`.
- A migration inicial foi aplicada no projeto e validada no SQL Editor.
- O botão `Atualizar agora` chama a função `start-collection` sem expor
  `APIFY_TOKEN` ao navegador.
- A função executa, nesta primeira integração, o fluxo real:
  `linkedin-post-search` -> `linkedin-post-comments` -> persistência idempotente.

## O que falta para execução real em produção

O projeto Supabase está acessível para SQL, mas o painel atual não habilita a
área de deploy/secrets de Edge Functions. Sem publicar a função e sem cadastrar
`APIFY_TOKEN` como secret do servidor, o navegador não deve executar o Actor
diretamente.

Secrets necessários na Edge Function:

```text
APIFY_TOKEN=<token da organização Apify>
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidos
automaticamente pelo ambiente das Edge Functions quando publicados pelo
Supabase. A service role nunca deve ser colocada no `.env.local` do Vite.

## Deploy previsto

```bash
supabase link --project-ref ppsusbybtkcjccwvysvk
supabase secrets set APIFY_TOKEN="<token>"
supabase functions deploy start-collection
```

Depois do deploy, é necessário autenticar um usuário no Signal Lab. A função
recusa chamadas sem sessão válida e grava `owner_id` para manter os dados
separados por usuário.

## Validação sem mock

- `GET /rest/v1/projetos` respondeu `200` no projeto real, com lista vazia antes
  da primeira coleta.
- A migration respondeu `Success. No rows returned` no SQL Editor.
- Os testes automatizados usam mocks apenas para isolar a UI; nenhuma amostra
  fictícia é usada pelo produto.
