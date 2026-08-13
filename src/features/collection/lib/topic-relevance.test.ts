import { describe, expect, it } from "vitest"
import { matchesTopic } from "../../../../supabase/functions/_shared/topic-relevance"

describe("topic relevance", () => {
  it("keeps only posts that explicitly mention the monitored term", () => {
    expect(matchesTopic({ keyword: "Vendas", text: "Estratégias de vendas B2B para 2026" })).toBe(true)
    expect(matchesTopic({ keyword: "Vendas", text: "Post sobre saúde e bem-estar" })).toBe(false)
  })

  it("applies configured inclusion and exclusion contexts", () => {
    expect(matchesTopic({ keyword: "cost breakdown", positiveContext: "procurement", text: "Cost breakdown for procurement teams" })).toBe(true)
    expect(matchesTopic({ keyword: "cost breakdown", positiveContext: "procurement", text: "Cost breakdown for consumer spending" })).toBe(false)
    expect(matchesTopic({ keyword: "cost breakdown", negativeContext: "consumer spending", text: "Cost breakdown and consumer spending" })).toBe(false)
  })
})
