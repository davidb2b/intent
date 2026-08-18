# Fase 0 — fundação verificável

## Resultado esperado

Reduzir as incertezas que poderiam obrigar a refazer banco, workers ou telas.
Esta fase não muda a produção e não aplica migrations definitivas.

## Linha de base preservada

- `main` permanece no commit anterior ao redesenho do produto.
- O banco atual e os dados reais não serão apagados.
- Edge Functions, cron e UI anteriores continuam funcionando até o corte.
- O novo motor nasce em tabelas e funções aditivas.
- Dados antigos não serão promovidos automaticamente a leads do Intent v1.

## Trilha 0.1 — domínio e linguagem

- [x] Registrar o fluxo people-first como fluxo canônico.
- [x] Congelar status, sinais, origens, níveis e eventos de crédito.
- [x] Separar visibilidade de cliente de dados internos.
- [x] Definir Brasil como escopo obrigatório da V1.
- [ ] David aprovar os contratos semânticos desta pasta.

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
- [ ] Confirmar comportamento para perfil indisponível.
- [x] Salvar fixture anonimizada e decisão dos três Actors testados.

Gate: nenhum Actor é considerado homologado apenas por README, nota ou número
de usuários. A aprovação exige input, output e custo de execução real.

## Trilha 0.4 — LLM

- [x] Separar geração de ICP de julgamento de sinal.
- [x] Definir que toda resposta passa por schema estrito.
- [x] Definir proveniência e literalidade para provas sociais e evidência.
- [ ] Fixar o modelo por operação e teto de custo.
- [ ] Validar os três schemas do onboarding com 5by5.
- [ ] Montar suíte dourada de julgamento com exemplos fortes, fracos e fora ICP.

## Trilha 0.5 — banco, fila e créditos

- [x] Definir migrations aditivas e estratégia de corte.
- [x] Definir visibilidade dos status.
- [x] Definir reserva e lançamento atômicos de crédito.
- [x] Definir jobs com retry, lease e dedupe.
- [ ] Transformar os contratos aprovados em migration da Fase 1/2.
- [ ] Criar testes de RLS antes de aplicar a migration remota.

## Gate final da Fase 0

A fase termina somente quando:

- [x] Apollo real aprovado;
- [x] Actor primário real aprovado;
- [ ] Actor fallback real aprovado;
- [ ] Brasil comprovado nos payloads;
- [ ] campos ausentes e degradação documentados;
- [ ] schemas de LLM aprovados;
- [ ] estratégia de dados privados aprovada;
- [ ] nenhuma secret foi registrada no Git;
- [ ] testes e build da branch passam.

## Riscos atualmente abertos

1. People Search aceita o filtro Brasil, mas não devolve o país literal no
   payload resumido; a regra regional exige confirmação por enriquecimento.
2. A dupla primária foi aprovada, mas o fallback combinado testado foi rejeitado
   por não preservar post nem timestamp; outro candidato precisa de run real.
3. Scraping público pode devolver atividade parcial; parcialidade deve ser
   explícita e nunca convertida em "sem intenção".
4. O RLS legado permite escrita ampla do proprietário e não protege revelação
   de contato contra leitura direta; precisa ser endurecido antes da Fase 2.
5. O monólito atual de UI deve ser dividido antes da reprodução do protótipo.
