import { describe, expect, it } from "vitest"

import { recommendedSourceIds } from "./recommended-sources"

describe("recommendedSourceIds", () => {
  it("selects only candidate sources with the strongest public conversation", () => {
    expect(recommendedSourceIds([
      { id: "monitored", status: "monitorada", posts: 20, comments: 30, ratio: 5 },
      { id: "first", status: "candidata", posts: 2, comments: 6, ratio: 3 },
      { id: "second", status: "candidata", posts: 4, comments: 6, ratio: 1.5 },
      { id: "third", status: "candidata", posts: 1, comments: 2, ratio: 1 },
      { id: "fourth", status: "candidata", posts: 8, comments: 1, ratio: .1 },
      { id: "discarded", status: "descartada", posts: 10, comments: 50, ratio: 5 },
    ])).toEqual(["first", "second", "third"])
  })
})
