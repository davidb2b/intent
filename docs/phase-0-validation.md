# Fase 0 — validação de segurança e contrato de dados

Status: em andamento.

Esta fase não libera novas telas. Ela garante que dados, credenciais e
contratos externos estejam corretos antes da coleta ponta a ponta.

## Regras inegociáveis

- O produto não usa dados simulados, nem converte falhas externas em resultados vazios.
- O navegador usa somente a URL e a publishable key do Supabase.
- `APIFY_TOKEN`, `OPENAI_API_KEY`, `SCHEDULER_SECRET` e a service role ficam
  exclusivamente nas Edge Functions.
- Uma fonte, pessoa ou comentário só entra no produto após confirmação de
  origem brasileira.
- Descoberta e monitoramento são fluxos diferentes e mantêm histórico/custo
  separados.

## Linha de base validada em 13 de agosto de 2026

### Infraestrutura

- O repositório não contém `.env.local`, token, chave de service role ou chave
  OpenAI rastreada pelo Git.
- O projeto Supabase possui os secrets `APIFY_TOKEN`, `OPENAI_API_KEY` e
  `SCHEDULER_SECRET`; os valores não foram lidos nem registrados neste arquivo.
- As Edge Functions exigem sessão autenticada ou o segredo específico do
  agendador. Chamadas sem sessão retornam erro explícito.
- A aplicação em produção e o localhost foram validados com as cinco rotas
  diretas: Visão geral, Posts, Comentários, Empresas e Pessoas.

### Descoberta real

- Uma descoberta autenticada para o termo `compras` concluiu com 100 posts
  lidos e custo real registrado de US$ 0,11405.
- A busca acionou `harvestapi/linkedin-post-search` e o verificador em lote
  `harvestapi/linkedin-profile-scraper`.
- Nenhuma fonte foi persistida porque nenhum perfil retornado comprovou Brasil.
  Esse resultado é correto: perfis estrangeiros ou sem localização explícita
  são rejeitados.
- A execução registrou 72 autores adiados pelo limite de 25 verificações por
  descoberta. O próximo ciclo deve validar o comportamento do lote antes de
  ampliar esse limite.

## Pendências que bloqueiam a Fase 1

1. Rotacionar a chave OpenAI exposta fora do gestor de secrets e substituir o
   valor apenas em `OPENAI_API_KEY` no Supabase. O console da OpenAI requer
   login da conta proprietária para esta operação.
2. Executar o Actor de perfil com URLs públicas brasileiras conhecidas e salvar
   uma amostra anonimizada em `docs/amostras/`.
3. Confirmar no payload real:
   - campo de URL canônica retornada;
   - todos os formatos de localização/país;
   - quantidade de itens retornados para uma lista de URLs;
   - custo e eventuais limites do plano.
4. Ajustar o adapter apenas depois dessa evidência, com teste automatizado para
   cada formato confirmado.

## Gate de saída

A Fase 0 só termina quando uma fonte brasileira conhecida for aceita pela
mesma regra usada em produção, uma fonte não brasileira for rejeitada e os
dois resultados estiverem cobertos por teste automatizado e amostra
anonimizada.
