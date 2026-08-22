# Fase 2 — descoberta da empresa

## Objetivo

Construir o contexto inicial da empresa sem usar pesquisa do Google e sem
misturar os contratos históricos do v1 com o novo domínio do Intent v2.

## Fluxo implementado

1. O backend lê o site informado em `apify/website-content-crawler`.
2. O primeiro link público em `linkedin.com/company/...` encontrado no site é
   preservado como referência da empresa. Links de perfil pessoal são ignorados.
3. O domínio do site é confirmado pela API de organizações do Apollo.
4. A página pública da empresa no LinkedIn é consultada por um Actor principal,
   com um Actor alternativo apenas se o primeiro falhar.
5. A empresa é consolidada com precedência LinkedIn → Apollo. O site continua
   sendo a fonte de contexto do negócio.
6. O resultado é salvo em `intent_v2_icps` como rascunho, com comprador e
   sinais ainda pendentes para a Fase 3.

## Regras e proteções

- Somente o backend chama Apify e Apollo.
- Nenhum e-mail, telefone ou dado de contato retornado pelo Apollo é salvo
  neste fluxo.
- Campos não confirmados ficam nulos. Não há preenchimento inventado.
- Cache por projeto, domínio e operação dura 30 dias; quando tudo já estiver
  disponível no cache, não há reserva nem consumo de crédito de onboarding.
- Falhas do Actor alternativo não apagam dados confirmados por site ou Apollo.
- O usuário recebe mensagens orientadas à ação; detalhes técnicos ficam apenas
  no registro interno da execução.

## Saída da fase

O deploy da Edge Function `discover-icp-v2` é o gate operacional. A tela de
onboarding histórica permanece intocada nesta etapa para não exibir um
rascunho v2 incompleto como se fosse o ICP final. A Fase 3 passa a completar
comprador e sinais e é o momento de ligar a nova experiência de interface.

## Validação

- Testes unitários confirmam extração do LinkedIn da empresa, precedência de
  firmografia e remoção de dados privados do payload do Apollo.
- A validação em produção exige uma execução com site real, Apollo configurado,
  Actor principal ou alternativo e uma linha criada em `intent_v2_icps`.
