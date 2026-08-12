# Signal Lab V1 — plano de desenvolvimento

## 0. Decisões que governam todo o projeto

- Signal Lab é separado de Intent e Golden Dog: repositório, Supabase,
  Vercel, secrets e migrations próprios.
- A V1 atende somente o projeto GEP. `projeto_id` existe no banco, mas não
  aparece como seletor na interface.
- Descoberta e monitoramento são operações diferentes, com botões, histórico,
  custos e casos de uso próprios.
- A descoberta é manual. O monitoramento é manual ou semanal.
- Nenhum Actor usa cookie ou login do LinkedIn.
- O front nunca recebe `APIFY_TOKEN`, `OPENAI_API_KEY` ou service role key.
- O dado observado e o dado descoberto nunca se misturam. A V1 mostra somente
  pessoas que comentaram posts monitorados.
- A automação nunca sobrescreve uma correção humana.
- Não usar mocks, dados sintéticos ou fallback silencioso no produto.

## 1. Ordem macro

```text
Passo 0: contratos reais e acessos
       ↓
PR 1: fundação, auth, banco e shell
       ↓
PR 2: coleta real, idempotência, custo e agenda
       ↓
PR 3: classificação e curadoria
       ↓
PR 4: telas de análise, exportação e acabamento
```

Cada PR terá branch própria, build, lint, testes e preview Vercel. Nada é
mesclado no `main` sem aprovação do checklist correspondente.

## 2. Passo 0 — contratos e acessos

### Objetivo

Eliminar incerteza sobre os dados antes de fechar o banco e os normalizadores.

### Backend e infraestrutura

- Confirmar repositório privado `davidb2b/signal-lab` e permissão de escrita.
- Criar projeto Supabase novo `signal-lab`.
- Criar projeto Vercel separado e conectar ao repositório.
- Configurar ambientes Development, Preview e Production.
- Configurar secrets somente nas Edge Functions/Vercel:
  `APIFY_TOKEN`, `OPENAI_API_KEY`, service role e webhook secret.
- Confirmar que o Actor principal e o fallback continuam sem cookies.

### Validação dos Actors

- Rodar `harvestapi/linkedin-post-search` com um termo e `maxPosts: 5`.
- Rodar `harvestapi/linkedin-post-comments` com um post que tenha comentários,
  `maxItems: 10`, `scrapeReplies: false` e `profileScraperMode: "main"`.
- Salvar os JSONs reais em `docs/amostras/`.
- Responder no README das amostras:
  - empresa atual estruturada ou somente `actor.position`;
  - setor e porte presentes ou ausentes;
  - estabilidade e preenchimento de `actor.linkedinUrl`;
  - custo real da leitura e do enriquecimento.

### Gate de saída

Não aplicar a migration final nem construir ingestão de comentários enquanto
essas respostas não estiverem registradas.

## 3. PR 1 — fundação e autenticação

### 3.1 Banco e segurança

- Criar migration versionada com `projetos`, `termos`, `fontes`, `posts`,
  `empresas`, `pessoas`, `comentarios`, `execucoes` e `custos`.
- Aplicar índices, constraints, uniques e RLS.
- Criar uma única linha inicial de projeto GEP por seed controlado.
- Definir política de leitura para usuário autenticado.
- Definir política de escrita: operações de coleta somente pelas Edge Functions;
  correções manuais somente nos campos explicitamente editáveis.
- Confirmar que a migration aplicada no Supabase corresponde ao arquivo do
  repositório.

### 3.2 Backend de autenticação

- Criar client Supabase exclusivamente em `src/features/auth/services` ou no
  adapter compartilhado permitido pela arquitetura.
- Implementar login com e-mail e senha.
- Implementar cadastro.
- Implementar recuperação de senha.
- Implementar callback de confirmação/reset.
- Implementar logout e restauração de sessão.
- Proteger as rotas da aplicação.
- Exibir estados de carregamento, erro de credencial, e-mail não confirmado e
  conexão indisponível.
- Não criar perfil ou tabela paralela sem necessidade da spec.

### 3.3 Frontend da fundação

- Reproduzir o shell do protótipo com Inter, verde `#146b49`, superfícies,
  bordas, sombra e responsividade.
- Criar layout autenticado com sidebar fixa.
- Criar cinco rotas vazias numeradas:
  - `/overview`
  - `/posts`
  - `/comments`
  - `/companies`
  - `/people`
- Criar barra de pesquisa ativa e barra de coleta como componentes de layout.
- Criar modal de configuração com palavra-chave, contextos positivos e
  exclusões. Nesta fase, salvar somente a configuração persistida.
- Criar estado vazio real, sem dados demonstrativos no produto.

### Gate do PR 1

David consegue abrir o preview, cadastrar/confirmar uma conta, fazer login,
recarregar a página, sair e entrar novamente. A aplicação vazia abre sem erro
no console e sem chamada para Apify.

## 4. PR 2 — coleta real

### 4.1 Contratos e adapters

Estrutura prevista:

```text
src/features/collection/
  components/
  hooks/
  lib/
  pages/
  services/
    discover-sources.ts
    run-monitoring.ts
    cost-guard.ts
    adapters/
      harvest-post-search.ts
      harvest-post-comments.ts
      profile-details.ts
```

- Cada Actor tem tipo de entrada e saída próprio.
- Adapters convertem o payload externo para DTOs do domínio.
- O domínio não importa SDK do Apify.
- A URL canônica de pessoa é normalizada em uma única função.
- O slug é o trecho depois de `/in/`, minúsculo, sem query e sem barra final.
- A chave de empresa remove acentos, pontuação e sufixos definidos pela spec.

### 4.2 Edge Function `descobrir-fontes`

- Receber `projeto_id`, `termos` e `janela`.
- Chamar busca com `3months`, `relevance`, sem comentários e sem reações.
- Agrupar posts por autor.
- Calcular posts, comentários, reações e razão comentário/reação.
- Gravar somente fontes candidatas.
- Nunca gravar pessoas, comentários ou empresas nesta operação.
- Não redescobrir fonte existente, inclusive descartada.

### 4.3 Edge Function `rodar-monitoramento`

- Impedir duas execuções concorrentes.
- Verificar teto mensal e teto da execução antes de cada chamada.
- Buscar posts das fontes `monitorada`.
- Atualizar contadores sem duplicar `post_urn`.
- Buscar comentários com `maxItems: 200`, `month` na rotina semanal e
  `profileScraperMode: "main"`.
- Registrar truncamento quando houver mais de 200 comentários.
- Criar/atualizar pessoas por slug.
- Criar/atualizar empresas por `nome_chave`.
- Criar comentários por `comentario_urn`.
- Registrar cada chamada e custo real em `custos`.
- Devolver execução parcial com erro explícito quando uma etapa falhar.

### 4.4 Agenda e operação

- Criar job Supabase Cron/pg_cron para segunda-feira às 06h de Brasília.
- O job chama o mesmo caso de uso do botão manual com `origem: "agendada"`.
- O botão usa `origem: "manual"`.
- A descoberta nunca entra no job.
- A janela semanal é `month`; backfill inicial é `3months`.

### 4.5 Frontend da coleta

- Tela de Coleta com dois botões independentes:
  - Descobrir fontes;
  - Atualizar monitoramento.
- Mostrar estimativa antes de executar.
- Mostrar histórico, origem, status, custo real e erro.
- Mostrar progresso e etapa atual.
- Mostrar teto por execução e teto mensal.
- Desabilitar ações quando houver execução concorrente ou teto excedido.

### Gate do PR 2

David executa descoberta, aprova três fontes, executa monitoramento e confere
os custos. Duas execuções iguais não duplicam pessoas, posts ou comentários.
O teste de teto com US$ 0,50 aborta de verdade. O agendamento é testado em
intervalo curto e depois devolvido para semanal.

## 5. PR 3 — classificação e curadoria

### Backend

- Implementar senioridade e ICP como regra determinística pura.
- Aplicar descarte de consultoria, fornecedor, estudante e sem empresa.
- Persistir motivo da classificação.
- Classificar teor em lotes de até 40 comentários.
- Usar temperatura 0 e o prompt literal da spec.
- Validar e rejeitar JSON inválido antes de gravar.
- Marcar confiança abaixo de 0,6 para revisão.
- Analisar posts uma única vez e gravar os quatro campos de curadoria.
- Nunca alterar linha com `revisado_por_humano = true`.

### Frontend

- Tela Posts com modo Resultados da busca.
- Lista à esquerda e detalhe à direita.
- Exibir tópico, problema, motivo e decisão de coleta nesta ordem.
- Aprovar/descartar post.
- Monitorar perfil do autor quando aplicável.
- Correção manual de ICP, cargo e senioridade com confirmação visual.
- Exibir marca de revisão para baixa confiança.

### Gate do PR 3

Descartar um post impede que ele entre no monitoramento. Corrigir uma pessoa,
reprocessar classificação e confirmar que a correção humana permanece.

## 6. PR 4 — telas e entrega do produto

### Frontend

- Visão geral com números atuais e atalhos.
- Posts em modo de perfis monitorados, com aproveitamento e corte âmbar abaixo
  de 25%.
- Comentários com filtros por teor, busca livre e texto integral.
- Empresas com participação, setor, porte, tópicos e pessoas observadas.
- Pessoas com filtros Todos, Com sinal observado e Descobertos na empresa.
- Estado vazio explícito para descobertos na empresa, porque é V2.
- Barra de pesquisa e barra de coleta presentes em todas as telas.
- Painel de gasto na sidebar com aviso a partir de 75%.
- Exportação CSV respeitando filtros, separador `;` e BOM UTF-8.
- Remover da V1 o botão “Mapear equipe relacionada” e o comitê descoberto.

### Qualidade

- Testes unitários de slug, nome de empresa, ICP, senioridade, custo e CSV.
- Testes de integração dos adapters com fixtures reais anonimizadas quando
  possível.
- Testes de idempotência da ingestão.
- Teste de RLS com usuário autenticado.
- Teste visual nas larguras desktop e mobile do protótipo.
- Verificação de acessibilidade básica: foco, labels, teclado e contraste.

### Gate do PR 4

David filtra por teor `dor`, pesquisa dentro do texto integral, encontra a
empresa, exporta CSV e abre no Excel sem quebrar acentos. Uma coleta atualiza
histórico e custo sem dados demonstrativos.

## 7. Estrutura final de pastas

```text
src/
  app/                         bootstrap e rotas
  components/                 shadcn e UI transversal
  features/
    auth/{components,hooks,lib,pages,services}
    overview/{components,hooks,lib,pages,services}
    research/{components,hooks,lib,pages,services}
    collection/{components,hooks,lib,pages,services}
    posts/{components,hooks,lib,pages,services}
    comments/{components,hooks,lib,pages,services}
    companies/{components,hooks,lib,pages,services}
    people/{components,hooks,lib,pages,services}
  infrastructure/
    apify/{adapters,actor-catalog.ts}
    supabase/{client.ts}
  lib/
    env.ts
    csv.ts
    dates.ts
supabase/
  functions/
    descobrir-fontes/
    rodar-monitoramento/
    classificar/
  migrations/
docs/
  actors/
  development-plan.md
```

Regra de dependência: páginas e componentes não importam o client do Supabase;
somente services fazem I/O. Regras de domínio são puras e testáveis.

## 8. Variáveis por ambiente

### Browser/Vercel público

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

### Edge Functions/Vercel privado

- `SUPABASE_SERVICE_ROLE_KEY`
- `APIFY_TOKEN`
- `OPENAI_API_KEY`
- `APIFY_WEBHOOK_SECRET`

Nenhuma secret entra em `src/`, `docs/`, fixtures ou commits.

## 9. Critério de parada antes de avançar

Se uma etapa não tiver dados reais, teste automatizado e critério de aceite
passando, ela não avança para a próxima. Em especial, a ausência de uma
amostra válida de comentários bloqueia a decisão definitiva sobre empresa,
cargo e identidade de pessoa.
