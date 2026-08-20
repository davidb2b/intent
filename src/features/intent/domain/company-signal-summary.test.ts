import { describe, expect, it } from "vitest"

import { buildCompanySignalSummary, companyActivityLevel } from "./company-signal-summary"

describe("company signal summary", () => {
  it("marks an account as moving only when two people have signals", () => {
    expect(companyActivityLevel(0)).toBe("fria")
    expect(companyActivityLevel(1)).toBe("aquecendo")
    expect(companyActivityLevel(2)).toBe("em_movimento")
  })

  it("summarizes the latest real signal from each person", () => {
    expect(buildCompanySignalSummary([
      { personId: "person-1", role: "CTO", type: "atividade_fraca", occurredAt: "2026-08-18" },
      { personId: "person-1", role: "CTO", type: "comentou_tema", occurredAt: "2026-08-20" },
      { personId: "person-2", role: "Head de Infra", type: "engajou_concorrente", occurredAt: "2026-08-19" },
    ])).toBe("CTO comentou sobre tema do ICP · Head de Infra interagiu com conteúdo de concorrente")
  })

  it("does not invent a specific action for an unknown signal type", () => {
    expect(buildCompanySignalSummary([
      { personId: "person-1", role: null, type: "tipo_novo", occurredAt: null },
    ])).toBe("Uma pessoa apresentou um sinal público")
  })
})
