# Fase 0 — baseline e critérios de aceite do Intent v2

**Data do baseline:** 21/08/2026  
**Status:** concluída no escopo de definição e validação do baseline  
**Produção observada:** `https://intent-teal.vercel.app/overview` na sessão
Chrome `gabriel.tickpost`  
**Regra:** esta fase não implementa o motor v2 e não altera dados de produção.

## 1. O que foi confirmado

O repositório é o projeto `davidb2b/intent`, com `main` alinhada a
`origin/main` no início da fase. A aplicação atual é React + Vite + TypeScript.
O produto publicado foi aberto com sessão autenticada e mostrou o shell do v1:

- workspace `5by5 / 5by5.com.br`;
- navegação Início, Pessoas, Contas e Watchlist;
- Perfil ideal, Testar classificação e Uso do plano;
- cards de “Intenção forte”, “Sinal fraco”, “Contas em movimento” e “Novas
  esta semana”;
- fila com pessoas e pontuações numéricas.

Esse registro é importante: o v1 publicado é um baseline real, não uma
confirmação de que o v2 já está em produção. O v2 deve substituir esse
comportamento gradualmente, mantendo compatibilidade e sem apagar o histórico.

## 2. Cenários oficiais de validação

### 2.1 Fiedler Automação — cenário industrial

Entrada oficial: `https://fiedler.com.br`.

Esperamos firmografia derivada do site e da página pública da empresa, cargos
relacionados às dores industriais e indústrias coerentes com a fonte. O ICP
deve ser regenerado sem inventar valores e permanecer editável antes da
ativação.

### 2.2 Scoreplan — contra-teste SaaS

O contra-teste deve provar que o motor não repete cargos industriais por
padrão. O contexto SaaS deve gerar cargos de planejamento, finanças e áreas
compatíveis com a empresa real, sem classificar tecnologia apenas porque o site
é de software.

### 2.3 Amostra de julgamento

Post: `Custo de energia industrial subiu 14%...`  
Comentário: `Só de vazamento de ar comprimido a conta subiu 18% no semestre`.

Resultado esperado: relevante, prova literal preservada, nível forte e entrada
como Lead.

### 2.4 Controles negativos

- `Parabéns pelo conteúdo!` deve ser reconhecido como cortesia, descartado antes
  da IA e não consumir crédito de julgamento.
- Uma paráfrase sem frase literal comprovável não pode ser salva como prova.
- Comentário sem contexto do post deve buscar o post; se não conseguir, deve
  ser descartado com motivo registrável e sem julgamento.

## 3. Contratos que ficam congelados para a Fase 1

### Onboarding

```text
site do cliente
  → crawler do site
  → primeira URL pública de empresa no LinkedIn
  → Apollo Organizations Enrich por domínio
  → Actor de empresa no LinkedIn
  → firmografia e contexto para revisão
```

Google não faz parte do caminho crítico do onboarding v2. A URL encontrada no
site e a resolução por domínio devem ser preservadas como evidência de origem.

### ICP

O ICP tem duas partes visíveis:

1. campos de busca: cargos, setores/indústrias, tamanho, localização e demais
   filtros definidos pelo documento;
2. sinais: dores, gatilhos e termos curtos reais derivados do contexto.

Não entram nessa versão: concorrentes, senioridade obrigatória, receita,
pesos, campos “desejável” ou exemplos fixos que não vieram do contexto real.
Brasil é fixo. Campos não confirmados ficam vazios/nulos.

### Julgamento

IA2 deve produzir apenas:

```json
{
  "relevante": true,
  "porque": "explicação curta baseada no contexto",
  "frase_prova": "frase literal do post ou comentário"
}
```

IA3 deve produzir apenas:

```json
{
  "nivel": "forte|media|fraca",
  "porque": "explicação curta baseada na evidência"
}
```

O produto transforma `forte` em Lead, `media` em Sinal fraco e `fraca` em
histórico. Nenhum score numérico de intenção será exibido.

## 4. Matriz de aceite

| Caso | Verificação | Evidência obrigatória |
|---|---|---|
| Fiedler | Site, Apollo e LinkedIn retornam firmografia industrial coerente | payloads redigidos, ICP revisável e tela de revisão |
| Scoreplan | Cargos e dores vêm do contexto SaaS real | ICP regenerado e contra-teste sem cargos industriais |
| Prova forte | Comentário confirma a dor do post literalmente | IA2 relevante, `frase_prova` literal, IA3 forte, Lead |
| Cortesia | Comentário social sem conteúdo de intenção | descarte antes da IA e custo de julgamento zero |
| Paráfrase | Texto sem prova literal suficiente | não salvar como evidência |
| Contexto ausente | Comentário não traz o post | fetch do post ou descarte com motivo |
| Regionalização | Pessoa, post, comentário e empresa passam pelo Brasil | registro de decisão; nenhum estrangeiro no radar |
| Permissões | Administrador e usuário comum | custo interno restrito; dados privados protegidos por RLS |
| Dados reais | Nenhuma tela usa mock em produção | smoke test visual e consultas reais |
| Reprocessamento | Mesmo evento chega novamente | idempotência, sem duplicação e custo sem lançamento duplo |

## 5. Limites de escopo desta fase

Não foram executados novos runs pagos, não foi acionada coleta, não foi feita
migration remota e nenhum dado existente foi apagado ou reclassificado. Isso é
intencional: a Fase 0 congela o contrato antes da mudança do modelo.

Os testes reais de Fiedler, Scoreplan e da amostra de comentários entram nas
fases de implementação, quando os contratos e migrations v2 estiverem
disponíveis. Fixtures anonimizadas podem ser usadas somente na suíte de testes;
elas não podem aparecer em produção.

## 6. Evidência técnica do baseline

Executado no commit de entrada da fase:

- `npm test -- --run`: **37 arquivos, 144 testes aprovados**;
- `npm run lint`: **aprovado**;
- `npm run build`: **aprovado**;
- build mantém apenas o alerta não bloqueante de bundle JavaScript acima de
  500 kB;
- árvore Git limpa antes da alteração documental.

## 7. Critério de saída

A Fase 0 é considerada encerrada quando:

- os dois documentos v2 estão registrados como fonte de planejamento;
- os cenários Fiedler e Scoreplan estão definidos;
- os contratos IA2/IA3, regionalização e ausência de dados estão congelados;
- a matriz de aceite está verificável;
- o baseline publicado foi observado na sessão autenticada;
- lint, testes e build passam;
- a mudança documental é publicada em branch própria e mergeada na `main`.

O próximo gate é a Fase 1: schema aditivo, migrations, RLS e contratos de
domínio para o fluxo v2, sem score numérico e sem ativação automática.
