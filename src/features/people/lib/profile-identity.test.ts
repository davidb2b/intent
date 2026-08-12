import { describe, expect, it } from "vitest"
import { normalizeProfileSlug } from "../../../../supabase/functions/_shared/profile-identity"

describe("profile identity", () => {
  it("canonicalizes LinkedIn profile URLs into one slug", () => {
    expect(normalizeProfileSlug("https://www.linkedin.com/in/Marcos-Ribeiro-123/?trk=abc")).toBe("marcos-ribeiro-123")
  })

  it("keeps two different slugs as different people", () => {
    expect(normalizeProfileSlug("https://www.linkedin.com/in/Ana-Silva-1")).not.toBe(normalizeProfileSlug("https://www.linkedin.com/in/Ana-Silva-2"))
  })
})
