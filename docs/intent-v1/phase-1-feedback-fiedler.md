# Fase 1 — fluxo V1 único e navegação do motor

Status: implementação inicial concluída; aguardando preview e homologação.

## Objetivo

Garantir que o usuário autenticado veja uma única experiência do Intent, sem
um shell legado com áreas bloqueadas ou mensagens de funcionalidade futura.
O motor deve apresentar somente as áreas que já possuem comportamento real:
Início, Pessoas, Contas, Watchlist, ICP e Testar classificação.

## Entrega desta rodada

- O fluxo autenticado principal continua direcionando para
  `IntentV1Workspace`.
- O fluxo de configuração (`/onboarding` e `/icp`) não carrega mais a
  navegação legada com itens desabilitados.
- A área de configuração mostra somente o Perfil ideal, que é a ação real
  disponível naquele contexto.
- A copy `Em breve` e o título técnico `Disponível em breve` foram removidos
  da experiência de configuração.
- O comportamento foi coberto por teste automatizado, sem dados de produção
  falsos e sem alteração em banco ou migrations.

## Critérios de aceite

- [x] Usuário autenticado acessa o workspace V1.
- [x] O shell legado não exibe itens desabilitados.
- [x] Não existe `Em breve` na configuração do ICP.
- [x] A suíte automatizada passa.
- [x] Lint passa.
- [x] Build de produção passa.
- [ ] Validar o preview autenticado no navegador.
- [ ] Confirmar Início, Pessoas, Contas e Watchlist com dados reais.
- [ ] David aprovar o preview antes do merge na `main`.

## Validação local

- Testes: 37 arquivos, 144 testes aprovados.
- Lint: aprovado.
- Build: aprovado.
- Alerta não bloqueante: bundle JavaScript acima de 500 kB após minificação.

## Próximo bloco

Publicar o preview desta branch e executar o smoke test autenticado. O teste
deve conferir headings, navegação, dados reais, evidência literal e ausência
de copy de placeholder antes de qualquer merge.
