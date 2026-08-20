import { describe, expect, it } from "vitest"

import { contactRevealCredits } from "./contact-reveal-cost.ts"

describe("contact reveal credits", () => {
  it("charges the customer plan exactly as specified", () => {
    expect(contactRevealCredits("email")).toBe(1)
    expect(contactRevealCredits("telefone")).toBe(10)
  })
})
