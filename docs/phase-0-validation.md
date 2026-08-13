# Fase 0 — validação de segurança e contrato de dados

Status: concluída para dados e infraestrutura. A rotação da chave OpenAI foi
adiada pelo responsável do projeto e permanece como risco de segurança aceito.

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
- A validação controlada do Actor de perfil concluiu com dois resultados e
  custo de US$ 0,008: um perfil com `countryCode: BR` foi aceito e outro com
  `countryCode: UA` foi rejeitado. A amostra mínima está em
  `docs/amostras/linkedin-profile-location-validation.json`.

## Pendências que bloqueiam a Fase 1

1. Rotacionar a chave OpenAI exposta fora do gestor de secrets e substituir o
   valor apenas em `OPENAI_API_KEY` no Supabase. Esta ação foi adiada pelo
   responsável e não bloqueia o início da Fase 1, mas não deve ser esquecida.
2. Ampliar a matriz de localização se o Actor passar a retornar formatos ainda
   não cobertos pelo teste atual.

## Gate de saída

A Fase 0 foi encerrada: uma fonte brasileira conhecida foi aceita pela mesma
regra usada em produção, uma fonte não brasileira foi rejeitada e ambos os
resultados estão cobertos por teste automatizado e amostra mínima.
