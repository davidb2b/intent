import { describe, expect, it } from "vitest"
import { calculateSignalPriority } from "./signal-priority"

describe("calculateSignalPriority", () => {
  const now = new Date("2026-08-20T12:00:00.000Z")

  it("prioritizes a recent direct buying signal without changing the stored judgment", () => {
    const result = calculateSignalPriority({
      currentIntent: 65,
      status: "sinal_fraco",
      now,
      signals: [{ type: "pediu_indicacao", occurredAt: "2026-08-19T12:00:00.000Z", score: 62 }],
    })

    expect(result.signalCount).toBe(1)
    expect(result.signalTypes).toEqual(["pediu_indicacao"])
    expect(result.score).toBe(82)
    expect(result.bucket).toBe("alta")
  })

  it("uses recurrence and recency to order an otherwise weak signal", () => {
    const result = calculateSignalPriority({
      currentIntent: 45,
      status: "sinal_fraco",
      now,
      signals: [
        { type: "comentou_tema", occurredAt: "2026-08-19T12:00:00.000Z", score: 45 },
        { type: "compartilhou_tema", occurredAt: "2026-08-10T12:00:00.000Z", score: 40 },
      ],
    })

    expect(result.score).toBe(62)
    expect(result.bucket).toBe("acompanhar")
    expect(result.label).toBe("Em acompanhamento")
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
