import { describe, expect, it } from "vitest"

import {
  buyerProfileSchema,
  buyingSignalsSchema,
  companyProfileSchema,
  enforceBrazilianBuyerScope,
  keepVerifiedCompanyProofs,
  validateBuyerProfile,
} from "../../../../supabase/functions/_shared/intent-onboarding-llm"

const unsupportedStrictKeywords = new Set([
  "maxItems",
  "maxLength",
  "maximum",
  "minItems",
  "minLength",
  "minimum",
  "uniqueItems",
])

function findUnsupportedKeywords(value: unknown, path = "$", found: string[] = []): string[] {
  if (!value || typeof value !== "object") return found
  for (const [key, child] of Object.entries(value)) {
    const nextPath = `${path}.${key}`
    if (unsupportedStrictKeywords.has(key)) found.push(nextPath)
    findUnsupportedKeywords(child, nextPath, found)
  }
  return found
}

describe("Intent structured output schemas", () => {
  it.each([
    ["company", companyProfileSchema],
    ["buyer", buyerProfileSchema],
    ["signals", buyingSignalsSchema],
  ])("keeps the %s schema inside the strict Responses subset", (_name, schema) => {
    expect(findUnsupportedKeywords(schema)).toEqual([])
  })

  it("enforces the fixed Brazilian scope independently from model wording", () => {
    expect(enforceBrazilianBuyerScope({ regioes: ["São Paulo", "América Latina"] })).toEqual({ regioes: ["Brasil"] })
  })

  it("keeps only social proof found literally in the collected source", () => {
    const profile = keepVerifiedCompanyProofs({
      provas_sociais: [
        { afirmacao: "Confirmada", evidencia_literal: "Mais de 100 projetos", fonte_url: "https://empresa.test" },
        { afirmacao: "Alterada", evidencia_literal: "Mais de cem projetos", fonte_url: "https://empresa.test" },
      ],
    }, { "https://empresa.test": "Clientes atendidos. Mais de 100 projetos realizados." })

    expect(profile.provas_sociais).toEqual([
      { afirmacao: "Confirmada", evidencia_literal: "Mais de 100 projetos", fonte_url: "https://empresa.test" },
    ])
  })

  it("rejects internal seniority codes used as job titles", () => {
    expect(() => validateBuyerProfile({
      schema_version: "intent.buyer_profile.v1",
      cargos: ["c_suite", "vp"],
      senioridades: ["c_suite", "vp"],
      setores: [{ familia: "tecnologia", label_linkedin: "IT Services and IT Consulting" }],
      portes: ["51-200"],
      regioes: ["Brasil"],
      exclusoes: [
        { tipo: "mesma_categoria", valor: "Consultorias", motivo: "Mesma categoria" },
        { tipo: "open_to_work", valor: "Open to Work", motivo: "Busca emprego" },
        { tipo: "dominio_proprio", valor: "5by5.com.br", motivo: "Domínio próprio" },
        { tipo: "concorrente", valor: "Concorrentes", motivo: "Concorrência" },
        { tipo: "cliente_atual", valor: "Clientes", motivo: "Cliente atual" },
      ],
    })).toThrow(/títulos profissionais concretos/)
  })
})
