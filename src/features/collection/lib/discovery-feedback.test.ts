import { describe, expect, it } from "vitest"

import { discoveryFeedback } from "./discovery-feedback"

const baseResult = {
  executionId: "execution-1",
  status: "concluida" as const,
  candidatesFound: 0,
  candidatesInserted: 0,
  candidatesRejected: 0,
  candidatesUnverified: 0,
  costUsd: 0,
  warnings: [],
}

describe("discovery feedback", () => {
  it("explains a real zero-result outcome without implying data was collected", () => {
    expect(discoveryFeedback({ ...baseResult, postsFound: 0 }, "cost breakdown")).toContain("Ainda não encontramos conversas públicas")
  })

  it("tells the user what remains after Brazilian profiles are found", () => {
    expect(discoveryFeedback({ ...baseResult, postsFound: 14, candidatesInserted: 2 }, "cost breakdown")).toContain("escolha quem deseja acompanhar")
  })
})
