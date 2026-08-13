# Conexão do backend

## Arquitetura atual

O browser usa somente o client do Supabase com URL e publishable key. Nenhum
token de provedor externo é enviado ao Vite ou ao navegador.

```text
UI -> service por feature -> Edge Function -> Apify/OpenAI -> Supabase
```

As funções ativas são:

- `discover-sources`: encontra autores candidatos e aceita apenas perfis
  brasileiros confirmados.
- `run-monitoring`: lê posts e comentários das fontes aprovadas, com
  deduplicação e custo por Actor.
- `classify-comments`: classifica comentários em lote sem sobrescrever revisão
  humana.
- `analyze-posts`: registra sugestões de curadoria para posts.

`start-collection` permanece como função legada e não é acionada pela UI atual.

## Secrets de servidor

Os valores ficam somente no painel de Edge Functions do Supabase:

```text
APIFY_TOKEN
OPENAI_API_KEY
SCHEDULER_SECRET
SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_URL` e as chaves padrão do projeto são fornecidas pelo ambiente da
Edge Function. A service role nunca deve aparecer no `.env.local`, no bundle
do Vite, em fixtures ou em commits.

## Contrato de segurança

- `discover-sources`, `run-monitoring`, `classify-comments` e `analyze-posts`
  validam a sessão do usuário antes de executar.
- O caminho agendado de `run-monitoring` exige `SCHEDULER_SECRET` e não usa
  usuário fictício.
- Falhas do Apify, do OpenAI ou de limites de custo retornam erro explícito e
  ficam registradas em `execucoes`; não são convertidas em dados vazios.

## Checklist operacional

Antes de publicar uma mudança de backend:

1. Aplicar migration versionada, se houver alteração de schema/RLS.
2. Publicar somente a Edge Function alterada.
3. Confirmar que os secrets exigidos existem pelo nome, sem ler seus valores.
4. Executar teste autenticado com teto de custo reduzido quando a mudança
   atingir coleta.
5. Conferir `execucoes` e `custos` no Supabase e a renderização na produção.
