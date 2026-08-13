import { describe, expect, it } from "vitest"
import { normalizeResearchInput, shouldStartNewResearch } from "./save-research"

describe("research configuration", () => {
  it("normalizes the keyword and contexts without triggering collection", () => {
    expect(normalizeResearchInput({ ownerId: "user-1", keyword: "  cost breakdown  ", positiveContext: " procurement, sourcing ", negativeContext: " personal finance " })).toEqual({
      ownerId: "user-1",
      keyword: "cost breakdown",
      positiveContext: "procurement, sourcing",
      negativeContext: "personal finance",
    })
  })

  it("preserves an empty context as an empty value for the service to persist as null", () => {
    expect(normalizeResearchInput({ ownerId: "user-1", keyword: "procurement", positiveContext: "", negativeContext: "  " }).positiveContext).toBe("")
  })
})

describe("research isolation", () => {
  it("starts a separate research only when the keyword changes", () => {
    expect(shouldStartNewResearch("compras", "cost breakdown")).toBe(true)
    expect(shouldStartNewResearch("cost breakdown", "cost breakdown")).toBe(false)
  })
})
