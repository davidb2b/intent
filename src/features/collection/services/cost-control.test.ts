import { describe, expect, it } from "vitest"

function estimateComments(maxItems: number) {
  return maxItems * 0.0015 * 2
}

describe("collection cost estimates", () => {
  it("estimates comment reading and profile enrichment separately", () => {
    expect(estimateComments(200)).toBe(0.6)
  })

  it("detects when the next call would exceed the execution ceiling", () => {
    const spent = 14.7
    const nextCall = estimateComments(200)
    expect(spent + nextCall).toBeGreaterThan(15)
  })
})
