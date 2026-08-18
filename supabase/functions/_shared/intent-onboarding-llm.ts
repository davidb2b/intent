type JsonSchema = Record<string, unknown>

const text = { type: "string" } as const
const strings = (_minItems: number, _maxItems: number): JsonSchema => ({
  type: "array",
  items: text,
})

const sizeBands = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10000+", "desconhecido"]
const seniorities = ["owner", "founder", "c_suite", "partner", "vp", "head", "director", "manager", "senior", "entry", "intern"]
const industryFamilies = ["tecnologia", "servicos_profissionais", "financeiro", "saude", "varejo", "transporte_logistica", "aviacao", "energia_utilities", "manufatura", "telecomunicacoes", "educacao", "governo", "outros"]
const exclusionTypes = ["mesma_categoria", "open_to_work", "dominio_proprio", "concorrente", "cliente_atual"]

export const companyProfileSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "idioma", "empresa_resumo", "oferta", "proposta_valor", "dores_resolvidas", "diferenciais", "provas_sociais", "segmentos_atendidos", "palavras_categoria", "firmografia"],
  properties: {
    schema_version: { type: "string", const: "intent.company_profile.v1" },
    idioma: text,
    empresa_resumo: text,
    oferta: text,
    proposta_valor: text,
    dores_resolvidas: strings(1, 8),
    diferenciais: strings(1, 8),
    provas_sociais: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["afirmacao", "evidencia_literal", "fonte_url"],
        properties: { afirmacao: text, evidencia_literal: text, fonte_url: text },
      },
    },
    segmentos_atendidos: strings(1, 20),
    palavras_categoria: strings(1, 20),
    firmografia: {
      type: "object",
      additionalProperties: false,
      required: ["nome", "dominio", "linkedin_url", "industria_literal", "faixa_funcionarios", "fundada_em", "sede", "pais"],
      properties: {
        nome: text,
        dominio: text,
        linkedin_url: { anyOf: [{ type: "string" }, { type: "null" }] },
        industria_literal: text,
        faixa_funcionarios: { type: "string", enum: sizeBands },
        fundada_em: { type: ["integer", "null"] },
        sede: text,
        pais: text,
      },
    },
  },
}

export const buyerProfileSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "cargos", "senioridades", "setores", "portes", "regioes", "exclusoes"],
  properties: {
    schema_version: { type: "string", const: "intent.buyer_profile.v1" },
    cargos: strings(1, 20),
    senioridades: { type: "array", items: { type: "string", enum: seniorities } },
    setores: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["familia", "label_linkedin"],
        properties: {
          familia: { type: "string", enum: industryFamilies },
          label_linkedin: text,
        },
      },
    },
    portes: { type: "array", items: { type: "string", enum: sizeBands } },
    regioes: strings(1, 20),
    exclusoes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tipo", "valor", "motivo"],
        properties: {
          tipo: { type: "string", enum: exclusionTypes },
          valor: text,
          motivo: text,
        },
      },
    },
  },
}

export const buyingSignalsSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "idioma", "dores", "gatilhos", "temas", "concorrentes", "regras"],
  properties: {
    schema_version: { type: "string", const: "intent.buying_signals.v1" },
    idioma: text,
    dores: strings(8, 8),
    gatilhos: strings(8, 8),
    temas: strings(12, 12),
    concorrentes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nome", "dominio", "motivo"],
        properties: { nome: text, dominio: text, motivo: text },
      },
    },
    regras: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nome", "prioridade", "descricao", "palavras_chave"],
        properties: {
          nome: text,
          prioridade: { type: "string", enum: ["High", "Medium"] },
          descricao: text,
          palavras_chave: strings(1, 30),
        },
      },
    },
  },
}

export type StructuredOutputResult = {
  costUsd: number
  durationMs: number
  model: string
  requestId: string | null
  usage: { inputTokens: number; outputTokens: number }
  value: Record<string, unknown>
}

export function enforceBrazilianBuyerScope(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value, regioes: ["Brasil"] }
}

export function keepVerifiedCompanyProofs(
  value: Record<string, unknown>,
  sourceTextByUrl: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const proofs = Array.isArray(value.provas_sociais) ? value.provas_sociais : []
  const verified = proofs.filter((proof) => {
    if (!proof || typeof proof !== "object") return false
    const item = proof as Record<string, unknown>
    const sourceUrl = typeof item.fonte_url === "string" ? item.fonte_url : ""
    const literal = typeof item.evidencia_literal === "string" ? item.evidencia_literal : ""
    return Boolean(sourceUrl && literal && sourceTextByUrl[sourceUrl]?.includes(literal))
  })
  return { ...value, provas_sociais: verified }
}

const prices = {
  "gpt-5.4-mini-2026-03-17": { input: 0.75, output: 4.5 },
  "gpt-5.4-nano-2026-03-17": { input: 0.2, output: 1.25 },
} as const

function responseText(payload: Record<string, unknown>): string {
  const output = Array.isArray(payload.output) ? payload.output : []
  for (const item of output) {
    if (!item || typeof item !== "object") continue
    const content = Array.isArray((item as Record<string, unknown>).content) ? (item as { content: unknown[] }).content : []
    for (const block of content) {
      if (!block || typeof block !== "object") continue
      const candidate = block as Record<string, unknown>
      if (candidate.type === "refusal") throw new Error(`A IA recusou a operação: ${String(candidate.refusal ?? "sem detalhe")}`)
      if (candidate.type === "output_text" && typeof candidate.text === "string") return candidate.text
    }
  }
  throw new Error("A IA não retornou texto estruturado.")
}

export async function runStructuredOutput(input: {
  apiKey: string
  model: keyof typeof prices
  schema: JsonSchema
  schemaName: string
  system: string
  user: string
  maxOutputTokens: number
  maxCostUsd: number
}): Promise<StructuredOutputResult> {
  const startedAt = Date.now()
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: input.model,
      input: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      max_output_tokens: input.maxOutputTokens,
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: input.schemaName, strict: true, schema: input.schema } },
    }),
    signal: AbortSignal.timeout(60_000),
  })

  const requestId = response.headers.get("x-request-id")
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}))
    const detail = typeof failure?.error?.message === "string" ? failure.error.message : `status ${response.status}`
    throw new Error(`Falha na geração por IA: ${detail}`)
  }

  const payload = await response.json() as Record<string, unknown>
  const usageRecord = payload.usage && typeof payload.usage === "object" ? payload.usage as Record<string, unknown> : {}
  const inputTokens = Number(usageRecord.input_tokens ?? 0)
  const outputTokens = Number(usageRecord.output_tokens ?? 0)
  const price = prices[input.model]
  const costUsd = (inputTokens * price.input + outputTokens * price.output) / 1_000_000
  if (costUsd > input.maxCostUsd) throw new Error(`A chamada ${input.schemaName} excedeu o teto de custo configurado.`)

  let value: Record<string, unknown>
  try {
    value = JSON.parse(responseText(payload))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`A IA retornou JSON inválido para ${input.schemaName}.`)
    throw error
  }

  return {
    costUsd,
    durationMs: Date.now() - startedAt,
    model: input.model,
    requestId,
    usage: { inputTokens, outputTokens },
    value,
  }
}

function array(value: unknown, label: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(`${label} fora do contrato.`)
  return value
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} fora do contrato.`)
  return value.trim()
}

function uniqueStringArray(value: unknown, label: string, min: number, max: number): string[] {
  const items = array(value, label, min, max).map((item) => nonEmptyString(item, label))
  const normalized = items.map((item) => item.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} contém itens duplicados.`)
  return items
}

export function validateCompanyProfile(
  value: Record<string, unknown>,
  sourceTextByUrl: Readonly<Record<string, string>>,
): void {
  if (value.schema_version !== "intent.company_profile.v1") throw new Error("Versão inválida do perfil da empresa.")
  nonEmptyString(value.empresa_resumo, "Resumo da empresa")
  nonEmptyString(value.oferta, "Oferta")
  nonEmptyString(value.proposta_valor, "Proposta de valor")
  uniqueStringArray(value.dores_resolvidas, "Dores resolvidas", 1, 8)
  uniqueStringArray(value.diferenciais, "Diferenciais", 1, 8)
  uniqueStringArray(value.segmentos_atendidos, "Segmentos atendidos", 1, 20)
  uniqueStringArray(value.palavras_categoria, "Palavras de categoria", 1, 20)
  const firmography = value.firmografia as Record<string, unknown> | undefined
  if (!firmography) throw new Error("Firmografia inválida.")
  nonEmptyString(firmography.nome, "Nome da empresa")
  nonEmptyString(firmography.dominio, "Domínio da empresa")
  for (const proof of array(value.provas_sociais, "Provas sociais", 0, 12)) {
    if (!proof || typeof proof !== "object") throw new Error("Prova social inválida.")
    const item = proof as Record<string, unknown>
    const sourceUrl = String(item.fonte_url ?? "")
    const literal = String(item.evidencia_literal ?? "")
    if (!sourceTextByUrl[sourceUrl]?.includes(literal)) throw new Error("Uma prova social não foi encontrada literalmente na fonte informada.")
  }
}

export function validateBuyerProfile(value: Record<string, unknown>): void {
  if (value.schema_version !== "intent.buyer_profile.v1") throw new Error("Versão inválida do perfil comprador.")
  const roles = uniqueStringArray(value.cargos, "Cargos", 1, 20)
  if (roles.some((role) => seniorities.includes(role as typeof seniorities[number]))) {
    throw new Error("Cargos deve conter títulos profissionais concretos, não códigos internos de senioridade.")
  }
  uniqueStringArray(value.senioridades, "Senioridades", 1, seniorities.length)
  array(value.setores, "Setores", 1, 20)
  uniqueStringArray(value.portes, "Portes", 1, sizeBands.length)
  const regions = uniqueStringArray(value.regioes, "Regiões", 1, 20)
  if (!regions.some((region) => region.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "brasil")) {
    throw new Error("Brasil é obrigatório no ICP da V1.")
  }
  const exclusions = array(value.exclusoes, "Exclusões", 5, 30)
  const received = new Set(exclusions.map((item) => String((item as Record<string, unknown>)?.tipo ?? "")))
  if (exclusionTypes.some((type) => !received.has(type))) throw new Error("As cinco exclusões obrigatórias não foram geradas.")
}

export function validateBuyingSignals(value: Record<string, unknown>): void {
  if (value.schema_version !== "intent.buying_signals.v1") throw new Error("Versão inválida dos sinais de compra.")
  uniqueStringArray(value.dores, "Dores", 8, 8)
  uniqueStringArray(value.gatilhos, "Gatilhos", 8, 8)
  uniqueStringArray(value.temas, "Temas", 12, 12)
  array(value.concorrentes, "Concorrentes", 5, 5)
  array(value.regras, "Regras", 6, 8)
}
