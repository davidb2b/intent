# Signal Lab — fundação

## Limites do sistema

- O Signal Lab é independente do Intent e do Golden Dog.
- O browser só lê o Supabase com a publishable key.
- Somente Edge Functions usam `APIFY_TOKEN`, `OPENAI_API_KEY` e service role.
- Apenas a camada `services` pode importar o client do Supabase.
- Actors externos nunca escrevem diretamente no banco: seus datasets passam por
  adapters, normalização e casos de uso.

## Organização por feature

```text
src/
  app/                       composição da aplicação e roteamento
  components/                UI compartilhada e shadcn/ui
  features/
    overview/                tela 01
    posts/                   tela 02 e curadoria
    comments/                tela 03 e exportação
    companies/               tela 04
    people/                  tela 05
    collection/              descoberta, monitoramento e histórico
    research/                configuração da pesquisa
  infrastructure/
    apify/                   catálogo e adapters externos
    supabase/                client único do browser
  lib/                       utilitários transversais
supabase/
  migrations/                schema versionado, RLS e índices
docs/
  actors/                    contratos e amostras reais dos Actors
```

## Fluxo de dados

```text
UI -> application/use-case -> service -> Edge Function -> Apify
                                      \-> normalizer -> Supabase
```

O front não conhece payload de Actor. O service recebe tipos próprios do
domínio. Cada Actor tem um adapter específico e todos convergem para os
mesmos comandos de ingestão.

## Ordem de execução

1. Validar amostras reais dos Actors e confirmar o contrato de comentários.
2. Aplicar a migration inicial em um Supabase novo chamado `signal-lab`.
3. Implementar autenticação e shell vazio.
4. Implementar descoberta separada de monitoramento.
5. Implementar ingestão idempotente e controle de custo.
6. Implementar classificação, curadoria e telas.

Não iniciar a modelagem final de `pessoas`/`comentarios` antes da amostra real
com comentários recentes.
