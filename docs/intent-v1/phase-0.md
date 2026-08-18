# Fase 0 — fundação verificável

## Resultado esperado

Reduzir as incertezas que poderiam obrigar a refazer banco, workers ou telas.
A fase foi encerrada em 18/08/2026 com migrations aditivas, sem ativar o novo
motor para usuários existentes.

## Linha de base preservada

- `main` contém os contratos, evidências e migrations da Fase 0 sem trocar o
  comportamento do produto.
- O banco atual e os dados reais não serão apagados.
- Edge Functions, cron e UI anteriores continuam funcionando até o corte.
- O novo motor nasce em tabelas e funções aditivas.
- Dados antigos não serão promovidos automaticamente a leads do Intent v1.

## Trilha 0.1 — domínio e linguagem

- [x] Registrar o fluxo people-first como fluxo canônico.
- [x] Congelar status, sinais, origens, níveis e eventos de crédito.
- [x] Separar visibilidade de cliente de dados internos.
- [x] Definir Brasil como escopo obrigatório da V1.
- [x] Contratos semânticos autorizados para implementação em 18/08/2026.

## Trilha 0.2 — Apollo

- [x] Confirmar o endpoint oficial de busca de pessoas.
- [x] Confirmar filtros de cargo, senioridade, localização, domínio e porte.
- [x] Confirmar paginação e limite de exibição.
- [x] Confirmar que People Search não entrega e-mail nem telefone.
- [x] Cadastrar `APOLLO_API_KEY` nos secrets do Supabase.
- [x] Executar `auth/health` com a chave real.
- [x] Consultar os limites reais da conta.
- [x] Rodar amostra com Brasil, três cargos e amostra limitada.
- [x] Salvar fixture anonimizada e limites observados.

Gate: não implementar `seed-radar` antes dos cinco itens de execução real.

## Trilha 0.3 — Apify

- [x] Confirmar acesso à organização correta no perfil `Gabriel Tickpost`.
- [x] Eliminar qualquer Actor que exija cookie de LinkedIn.
- [x] Levantar candidatos que observam comentários feitos pela pessoa.
- [x] Confirmar Actors HarvestAPI separados para comentários e reações.
- [x] Levantar fallback combinado para comentários + reações sem cookie.
- [x] Rodar primário e fallback com os mesmos 3 perfis públicos brasileiros.
- [x] Comparar cobertura, identidade, timestamps, post, evidência e custo.
- [x] Confirmar comportamento para perfil indisponível.
- [x] Salvar fixture anonimizada e decisão dos quatro Actors testados.

Gate: nenhum Actor é considerado homologado apenas por README, nota ou número
de usuários. A aprovação exige input, output e custo de execução real.

## Trilha 0.4 — LLM

- [x] Separar geração de ICP de julgamento de sinal.
- [x] Definir que toda resposta passa por schema estrito.
- [x] Definir proveniência e literalidade para provas sociais e evidência.
- [x] Fixar o modelo por operação e teto de custo.
- [x] Validar os três schemas do onboarding com a PoC real de 5by5.
- [x] Montar suíte dourada de julgamento com exemplos fortes, fracos e fora ICP.

## Trilha 0.5 — banco, fila e créditos

- [x] Definir migrations aditivas e estratégia de corte.
- [x] Definir visibilidade dos status.
- [x] Definir reserva e lançamento atômicos de crédito.
- [x] Definir jobs com retry, lease e dedupe.
- [x] Transformar os contratos aprovados nas migrations aditivas `0009` e
  `0010`.
- [x] Criar e executar testes de RLS antes de aplicar a migration remota.

## Gate final da Fase 0

A fase termina somente quando:

- [x] Apollo real aprovado;
- [x] Actor primário real aprovado;
- [x] Actor fallback real aprovado;
- [x] Brasil comprovado literalmente por enriquecimento;
- [x] campos ausentes e degradação documentados;
- [x] schemas de LLM aprovados;
- [x] estratégia de dados privados aprovada e testada;
- [x] nenhuma secret foi registrada no Git;
- [x] testes e build da `main` passam.

## Riscos atualmente abertos

1. People Search aceita o filtro Brasil, mas não devolve o país literal no
   payload resumido. O enriquecimento confirmou `country=Brazil`; produção deve
   manter essa segunda etapa antes de ativar a pessoa no radar.
2. O fallback aprovado é degradado: exige lote mínimo de 20, não informa timezone
   e omite texto/autor separado do post. Deve ser chamado por tipo e nunca
   substituir silenciosamente campos ausentes.
3. Um run `SUCCEEDED` pode representar perfil indisponível. O adapter deve ler
   diagnóstico ou item `error`; vazio sem diagnóstico continua parcial, nunca
   vira automaticamente "sem atividade".
4. O RLS da fundação já protege radar, fit, IDs de fornecedor, contatos, jobs,
   payloads e custos. Os próximos endpoints ainda precisam repetir ownership e
   idempotência no backend antes de liberar ações da Fase 1.
5. O monólito atual de UI deve ser dividido durante a reprodução do onboarding
   da Fase 1.

## Estado de encerramento

Fase 0 encerrada em 18/08/2026. As migrations `0009` e `0010` foram aplicadas
ao projeto remoto `ppsusbybtkcjccwvysvk`; o histórico local/remoto ficou
alinhado, o lint remoto não encontrou erros e o novo motor permanece desligado
por padrão por `intent_people_first = false`. O próximo trabalho é a Fase 1:
onboarding `site -> ICP editável e versionado`.
