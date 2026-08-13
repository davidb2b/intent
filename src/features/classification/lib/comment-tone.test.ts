import { describe, expect, it } from "vitest"

import { commentToneLabel, matchesCommentFilter } from "./comment-tone"

describe("comment tone presentation", () => {
  it("includes the real pratica category in the Experiências filter", () => {
    expect(matchesCommentFilter("pratica", "experience")).toBe(true)
    expect(commentToneLabel("pratica")).toBe("Experiência")
  })

  it("keeps generic comments out of the Dores filter", () => {
    expect(matchesCommentFilter("generico", "pain")).toBe(false)
    expect(commentToneLabel("generico")).toBe("Genérico")
  })
})
