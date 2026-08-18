import { describe, expect, it } from "vitest"
import { parseSourceMeta } from "./source-meta"

describe("source metadata", () => {
  it("preserves real metrics used by an author suggestion", () => {
    expect(parseSourceMeta(JSON.stringify({ posts: 2, pessoas: 3, icp: 3 }))).toEqual({
      posts: 2,
      pessoas: 3,
      icp: 3,
    })
  })

  it("does not invent metrics when legacy metadata is invalid", () => {
    expect(parseSourceMeta("not-json")).toEqual({})
    expect(parseSourceMeta(null)).toEqual({})
  })
})
