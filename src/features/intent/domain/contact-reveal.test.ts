import { describe, expect, it } from "vitest"

import { extractApolloContact } from "../../../../supabase/functions/_shared/contact-reveal"

describe("contact reveal normalization", () => {
  it("reads only an explicit contact returned by the provider", () => {
    expect(extractApolloContact({ person: { email: "ana@empresa.com.br" } }, "email")).toBe("ana@empresa.com.br")
    expect(extractApolloContact({ person: { phone_numbers: [{ sanitized_number: "+5511999999999" }] } }, "telefone")).toBe("+5511999999999")
  })

  it("does not invent a contact when the provider omits it", () => {
    expect(extractApolloContact({ person: { name: "Ana" } }, "email")).toBeNull()
    expect(extractApolloContact({ person: { name: "Ana" } }, "telefone")).toBeNull()
  })
})
