# Fase 1 — domínio v2, schema aditivo e RLS

**Status:** implementada no código e validada localmente em 21/08/2026.

## Objetivo

Preparar o armazenamento do Intent v2 sem misturar o novo contrato com o
radar v1. A migration `0024_intent_v2_phase1_domain.sql` cria uma fonte de
verdade versionada para o ICP, mantém o Brasil como região obrigatória e
protege o projeto por RLS.

## O que entrou

- `intent_v2_icps`, separado de `icps`, `pessoas` e `sinais` do v1;
- versões com estados `rascunho`, `ativo` e `arquivado`;
- no máximo um ICP v2 ativo por projeto;
- URL pública do site obrigatória e URL pública do LinkedIn opcional;
- `empresa`, `comprador` e `sinais_de_compra` como objetos JSONB validados por
  contrato de domínio, preservando a origem dos dados;
- Brasil obrigatório na lista de localizações;
- origem da execução, autor e timestamps para rastreabilidade;
- RLS por proprietário do projeto, com acesso separado para `authenticated` e
  `service_role`;
- contratos TypeScript v2 em arquivo próprio, sem score numérico e sem alterar
  os contratos v1.

## O que não entrou

Esta fase não executa coleta, não chama Apify/Apollo, não gera ICP com IA, não
ativa o v2 para usuários, não cria mocks em produção e não altera registros
existentes. A aplicação remota da migration precisa ser confirmada no projeto
Supabase correto antes de considerar o banco publicado.

## Critérios de saída

- migration aditiva revisada;
- validação de URL, origem, Brasil e ausência de placeholders;
- testes, lint e build aprovados;
- commit e merge na `main`;
- aplicação remota da migration confirmada separadamente na sessão correta do
  `gabriel.tickpost`.
