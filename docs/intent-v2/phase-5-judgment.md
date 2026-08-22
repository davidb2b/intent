# Fase 5 — julgamento IA2 e IA3

## Objetivo

Transformar um comentário público já higienizado em uma decisão auditável, sem
score numérico:

1. **IA2** verifica se o comentário é relevante para o perfil ideal ativo.
2. **IA3** define o nível da atividade relevante: \`forte\`, \`media\` ou
   \`fraca\`.
3. A prova precisa existir literalmente no comentário ou no post de contexto.

## Contratos

IA2 devolve estritamente:

\`\`\`json
{ "relevante": true, "porque": "explicação curta", "frase_prova": "trecho literal" }
\`\`\`

IA3 devolve estritamente:

\`\`\`json
{ "nivel": "forte|media|fraca", "porque": "explicação curta" }
\`\`\`

Uma frase que não ocorra literalmente no conteúdo público invalida a decisão,
mesmo que a IA a tenha marcado como relevante.

## Saídas

| Resultado | Efeito |
| --- | --- |
| IA2 irrelevante ou sem prova literal | candidato rejeitado com motivo compreensível |
| IA3 fraca | candidato no histórico, sem sinal para abordagem |
| IA3 media | pessoa em acompanhamento (\`sinal_fraco\`) |
| IA3 forte | pessoa priorizada como lead |

O campo \`sinais.nota\` é preenchido com \`0\` somente para manter a leitura
legada estável. O fluxo V2 não o utiliza nem o apresenta; o nível auditado é a
fonte de prioridade.

## Proteções

- Reações continuam fora da IA2/IA3.
- A IA só recebe comentário com contexto de post após os filtros da Fase 4.
- Cada chamada salva modelo, versão do prompt, request ID, duração e custo em
  registros privados protegidos por RLS.
- A Fase 5 não dispara cascatas: o gate binário e a expansão pertencem à Fase 6.

## Validação

Os testes unitários cobrem os contratos estritos, a exigência de prova literal
e o mapeamento de nível. A primeira execução real continua sujeita à autorização
do cliente, pois consome IA.
