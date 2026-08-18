import { describe, expect, it } from "vitest"
import { normalizePublicSiteUrl, stagePosition } from "./onboarding"

describe("Intent onboarding domain", () => {
  it("normalizes a public company domain", () => {
    expect(normalizePublicSiteUrl("b2binsiders.com.br")).toBe("https://b2binsiders.com.br/")
  })

  it("rejects local and private-looking inputs", () => {
    expect(() => normalizePublicSiteUrl("localhost:3000")).toThrow("domínio público")
    expect(() => normalizePublicSiteUrl("127.0.0.1")).toThrow("domínio público")
  })

  it("orders only real backend stages", () => {
    expect(stagePosition("site")).toBe(0)
    expect(stagePosition("icp")).toBe(3)
    expect(stagePosition("concluida")).toBe(4)
  })
})
