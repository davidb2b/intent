import { describe, expect, it } from "vitest"

import { hasApifyItemLimit } from "../../../supabase/functions/_shared/apify-result"

describe("Apify marketplace quota detection", () => {
  it("recognizes the actual item-limit message returned by the profile Actor", () => {
    expect(hasApifyItemLimit([{ message: "free user item limit exceeded" }])).toBe(true)
  })

  it("does not treat a valid Actor dataset as a quota error", () => {
    expect(hasApifyItemLimit([{ linkedinUrl: "https://www.linkedin.com/in/pessoa-brasileira" }])).toBe(false)
  })
})
