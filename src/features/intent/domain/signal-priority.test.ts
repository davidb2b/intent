import { describe, expect, it } from "vitest"
import { calculateSignalPriority } from "./signal-priority"

describe("calculateSignalPriority", () => {
  const now = new Date("2026-08-20T12:00:00.000Z")

  it("applies the 30-day half-life to every captured signal", () => {
    const result = calculateSignalPriority({
      currentIntent: 65,
      status: "sinal_fraco",
      now,
      signals: [{ type: "pediu_indicacao", occurredAt: "2026-08-19T12:00:00.000Z", score: 62 }],
    })

    expect(result.signalCount).toBe(1)
    expect(result.signalTypes).toEqual(["pediu_indicacao"])
    expect(result.score).toBe(61)
    expect(result.bucket).toBe("acompanhar")
  })

  it("adds decayed evidence and caps the public score at 100", () => {
    const result = calculateSignalPriority({
      currentIntent: 0,
      status: "sinal_fraco",
      now,
      signals: [
        { type: "comentou_tema", occurredAt: "2026-08-19T12:00:00.000Z", score: 70 },
        { type: "compartilhou_tema", occurredAt: "2026-07-21T12:00:00.000Z", score: 70 },
      ],
    })

    expect(result.score).toBe(100)
    expect(result.bucket).toBe("alta")
    expect(result.label).toBe("Prioridade alta")
  })

  it("does not create a signal from unknown or malformed activity", () => {
    const result = calculateSignalPriority({
      currentIntent: null,
      status: "vigiado",
      now,
      signals: [{ type: "unknown", occurredAt: "not-a-date", score: 100 }],
    })

    expect(result).toEqual({ score: 0, bucket: "acompanhar", label: "Em acompanhamento", signalCount: 0, signalTypes: [] })
  })

  it("keeps an already classified client in the high-priority bucket", () => {
    const result = calculateSignalPriority({ currentIntent: 0, status: "cliente", signals: [] })
    expect(result.bucket).toBe("alta")
  })
})
