# Contratos de domínio

Os valores desta página são estáveis e também existem como tipos em
`src/features/intent/domain/contracts.ts`.

## ICP

- Status: `rascunho | ativo | arquivado`.
- Uma única versão pode estar ativa por projeto.
- Regenerar cria nova versão; nunca sobrescreve a versão ativa.
- Todo julgamento referencia o `icp_id` efetivamente usado.

## Pessoa

Origem interna:

- `semente_apollo`
- `cascata_empresa`
- `cascata_post`
- `cascata_autor`

Status:

- `vigiado`: interno e invisível;
- `lead`: ICP com sinal forte;
- `sinal_fraco`: ICP com sinal abaixo de 80;
- `cliente`: marcado pelo usuário e excluído de abordagem;
- `fora_icp`: somente auditoria em "Todas".

Fit é interno. Intenção é inteiro de 0 a 100. Uma pessoa sem sinal não pode
virar lead apenas por fit.

## Sinal

Taxonomia fechada:

- `comentou_tema`
- `pediu_indicacao`
- `mudou_cargo`
- `engajou_concorrente`
- `engajou_influenciador`
- `compartilhou_tema`
- `atividade_fraca`

Cada sinal exige `urn_unico`, data, pessoa e evidência. Evidência de comentário
é a frase literal; resumo do post fica em `contexto` e não substitui evidência.

## Julgamento

Saída mínima:

```json
{
  "nota": 86,
  "regra_que_bateu": "Dor declarada",
  "evidencia_citada": "frase literal do sinal"
}
```

Validações:

- `nota` inteira entre 0 e 100;
- regra deve existir no ICP ou assumir valor controlado `nenhuma`;
- a evidência citada deve ser substring da evidência capturada;
- resposta inválida não atualiza a pessoa;
- modelo, versão do prompt, custo e `icp_id` são obrigatórios na auditoria.

## Empresa

Níveis: `em_movimento | aquecendo | fria`.

`em_movimento` exige no mínimo duas pessoas visíveis com sinal na mesma
empresa. O contador é derivado dos sinais, não um número editado no front.

## Job

Tipos:

- `gerar_icp`
- `semear_radar`
- `vigiar_pessoa`
- `julgar_sinal`
- `varrer_post`
- `varrer_empresa`
- `investigar_autor`
- `varrer_watchlist`
- `revelar_contato`

Estados: `pendente | rodando | concluido | falhou | aguardando_creditos`.

O mesmo `projeto_id + tipo + payload_hash` ativo não pode existir duas vezes.

## Créditos

Eventos e valores da V1:

- `onboarding`: 12;
- `pessoa_julgada`: 1;
- `email_revelado`: 1;
- `telefone_revelado`: 10;
- `verificacao_sem_sinal`: 0.

O ledger aceita reserva, consumo, estorno e concessão mensal. Custo USD é
registrado separadamente e não deve aparecer para cliente comum.

## Brasil

- Apollo recebe `person_locations[]=Brazil` e, quando aplicável,
  `organization_locations[]=Brazil`.
- O retorno continua sujeito a validação de localização.
- Sem evidência suficiente de Brasil, a pessoa não entra no radar ativo; fica
  pendente de verificação, nunca presumida brasileira.
- A expansão por post não pode furar a regra regional.

