# Fase 3 — geração estruturada do rascunho v2

## Objetivo

Transformar as evidências públicas já confirmadas da empresa em um rascunho
estruturado e revisável. Esta fase não coleta dados, não revela contatos, não
classifica pessoas e não atribui qualquer nota de intenção.

## Cadeia obrigatória

1. **IA1a — perfil da empresa:** organiza resumo, oferta, proposta de valor,
   dores, segmentos e firmografia. O site explica produto e oferta; quando
   LinkedIn e Apollo divergem em firmografia, LinkedIn prevalece.
2. **IA1b — perfil ideal:** deriva entre quatro e oito cargos brasileiros
   concretos exclusivamente das dores confirmadas, além de indústrias e
   tamanhos aplicáveis.
3. **IA1c — sinais de compra:** produz exatamente oito dores, oito gatilhos e
   doze termos curtos de vocabulário real relacionado ao contexto anterior.

## Proteções

- O contrato JSON é estrito: não aceita campos extras ou ausentes.
- Valores sem confirmação ficam `null` ou vazios; `Outros`, `Desconhecido` e
  variações não são valores válidos.
- Não são gerados score, senioridade, receita, exclusões ou concorrentes.
- As três respostas são validadas antes de qualquer atualização do ICP.
- Uma falha não sobrescreve o rascunho anterior.
- A execução armazena modelo, versão do prompt, custo e horário para auditoria.

## Critério de aceite

Uma descoberta concluída deve permitir a geração autenticada e produzir um
rascunho com os três blocos válidos, referências de origem preservadas e uma
execução auditável. A homologação real exige ação deliberada do usuário porque
utiliza a API de IA.
