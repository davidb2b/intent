import { describe, expect, it } from "vitest"

import {
  buyerProfileSchema,
  buyingSignalsSchema,
  companyProfileSchema,
  enforceBrazilianBuyerScope,
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
})
