# Contratos LLM — Fase 0

## Decisão

Toda operação usa Structured Outputs com `strict: true`, JSON Schema versionado
e `additionalProperties: false`. O resultado só pode chegar ao repositório depois
da validação de domínio; JSON válido, sozinho, não é sucesso.

Schemas executáveis:

- `intent.company_profile.v1` — perfil da empresa e firmografia;
- `intent.buyer_profile.v1` — comprador, filtros e cinco exclusões obrigatórias;
- `intent.buying_signals.v1` — exatamente 8 dores, 8 gatilhos, 12 temas,
  5 concorrentes e 6–8 regras;
- `intent.signal_judgment.v1` — nota inteira, regra do ICP e evidência literal.

Os três outputs do onboarding foram validados contra a PoC real de 5by5
fornecida no protótipo. A fixture anonimizada está em
`fixtures/5by5-llm-schema-homologation.json`.

## Modelos e teto por chamada

| Operação | Snapshot | Input máx. | Output máx. | Pior caso calculado | Teto |
|---|---|---:|---:|---:|---:|
| Perfil da empresa | `gpt-5.4-nano-2026-03-17` | 48.000 | 2.500 | US$ 0,012725 | US$ 0,015 |
| Quem compra | `gpt-5.4-nano-2026-03-17` | 12.000 | 2.500 | US$ 0,005525 | US$ 0,007 |
| Sinais de compra | `gpt-5.4-mini-2026-03-17` | 16.000 | 4.000 | US$ 0,030000 | US$ 0,035 |
| Julgamento | `gpt-5.4-nano-2026-03-17` | 4.000 | 500 | US$ 0,001425 | US$ 0,002 |

Os preços congelados neste cálculo são os publicados em 18/08/2026: nano
US$ 0,20/M input e US$ 1,25/M output; mini US$ 0,75/M input e US$ 4,50/M
output. O adapter deve recusar uma chamada cujo orçamento calculado exceda o
teto e registrar tokens, latência, modelo, prompt e custo observado.

## Regras semânticas depois do schema

- prova social exige trecho literal presente no texto da URL informada;
- Brasil é obrigatório nas regiões do comprador na V1;
- as cinco exclusões fechadas sempre existem;
- domínio de concorrente não aceita protocolo ou caminho;
- regra do julgamento deve pertencer ao ICP ativo ou ser `nenhuma`;
- evidência citada deve ser substring exata da evidência capturada;
- resposta inválida não atualiza ICP, pessoa ou sinal.

## Taxonomias

Labels de setor vindos de LinkedIn/Apollo são preservados em
`label_linkedin`. O domínio usa uma família fechada e estável para evitar que a
regra de negócio dependa de nomes que o fornecedor pode alterar. Cargos
continuam literais porque são usados como aparecem no LinkedIn; senioridade,
porte, família de setor, exclusão e prioridade são enums fechados.

## Testes

A suíte cobre a PoC real de 5by5, contagens obrigatórias, campos extras,
versões incompatíveis, taxonomias abertas, região fora do Brasil, provas sem
fonte, custo máximo e uma suíte dourada de julgamento forte, fraco e fora do
ICP. O caso fora do ICP para antes da chamada paga ao modelo.

A execução real do pipeline com o modelo continua sendo gate da Fase 1, quando
existirá a Edge Function `generate-icp`; a Fase 0 aprova o contrato que essa
função será obrigada a cumprir.
