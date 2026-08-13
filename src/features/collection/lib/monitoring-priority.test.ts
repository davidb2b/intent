import { describe, expect, it } from "vitest"

describe("monitoring priority", () => {
  it("keeps the comment workload bounded to the most active posts", () => {
    const comments = [2, 15, 0, 9, 5]
    const selected = comments.filter((count) => count > 0).sort((a, b) => b - a).slice(0, 3)
    expect(selected).toEqual([15, 9, 5])
  })
})
