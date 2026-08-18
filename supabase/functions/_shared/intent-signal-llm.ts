import { runStructuredOutput } from "./intent-onboarding-llm.ts"

function signalJudgmentSchema(capturedEvidence: string) {
  return {
  type: "object",
  additionalProperties: false,
  required: ["nota", "regra_que_bateu", "evidencia_citada"],
  properties: {
    nota: { type: "integer", minimum: 0, maximum: 100 },
    regra_que_bateu: { type: "string", minLength: 1 },
    evidencia_citada: { type: "string", const: capturedEvidence },
  },
  }
}

export type SignalJudgment = {
  nota: number
  regra_que_bateu: string
  evidencia_citada: string
}

export function validateSignalJudgment(
  value: Record<string, unknown>,
  capturedEvidence: string,
  allowedRules: readonly string[],
): SignalJudgment {
  const keys = Object.keys(value).sort().join(",")
  if (keys !== "evidencia_citada,nota,regra_que_bateu") throw new Error("O julgamento retornou campos incompatíveis.")
  if (!Number.isInteger(value.nota) || Number(value.nota) < 0 || Number(value.nota) > 100) throw new Error("A nota de intenção ficou fora do intervalo permitido.")
  if (typeof value.regra_que_bateu !== "string" || !value.regra_que_bateu.trim()) throw new Error("O julgamento não informou uma regra válida.")
  const rule = value.regra_que_bateu.trim()
  if (rule !== "nenhuma" && !allowedRules.includes(rule)) throw new Error("O julgamento citou uma regra fora do perfil ideal ativo.")
  if (typeof value.evidencia_citada !== "string" || !value.evidencia_citada.trim() || !capturedEvidence.includes(value.evidencia_citada.trim())) {
    throw new Error("A evidência citada não existe literalmente na atividade capturada.")
  }
  return { nota: Number(value.nota), regra_que_bateu: rule, evidencia_citada: value.evidencia_citada.trim() }
}

export async function judgePublicSignal(input: {
  apiKey: string
  evidence: string
  context: string | null
  ruleDefinitions: Array<{ nome: string; prioridade?: string; descricao?: string; palavras_chave?: string[] }>
}) {
  const allowedRules = input.ruleDefinitions.map((rule) => rule.nome).filter(Boolean)
  const result = await runStructuredOutput({
    apiKey: input.apiKey,
    model: "gpt-5.4-nano-2026-03-17",
    schema: signalJudgmentSchema(input.evidence),
    schemaName: "intent_signal_judgment_v1",
    system: [
      "Você avalia evidências públicas de intenção de compra B2B no Brasil.",
      "Use somente a evidência literal e o contexto fornecidos.",
      "Escolha exatamente uma regra do perfil ideal ou 'nenhuma'.",
      "Copie a evidência capturada inteira e sem qualquer alteração no campo evidencia_citada.",
      "Não invente cargo, empresa, necessidade, orçamento, prazo ou significado ausente.",
    ].join(" "),
    user: JSON.stringify({
      evidencia_capturada: input.evidence,
      contexto_publico: input.context,
      regras_permitidas: input.ruleDefinitions,
      escala: "0 sem intenção; 80 ou mais indica intenção forte e explícita",
    }),
    maxOutputTokens: 500,
    maxCostUsd: 0.002,
  })
  return { ...result, judgment: validateSignalJudgment(result.value, input.evidence, allowedRules) }
}
