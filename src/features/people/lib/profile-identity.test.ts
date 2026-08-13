import { describe, expect, it } from "vitest"
import { buildBrazilProfileBatchInput, requestedProfileSlugs } from "../../../../supabase/functions/_shared/brazil-profile-verification"
import { normalizeProfileSlug } from "../../../../supabase/functions/_shared/profile-identity"

describe("profile identity", () => {
  it("canonicalizes LinkedIn profile URLs into one slug", () => {
    expect(normalizeProfileSlug("https://www.linkedin.com/in/Marcos-Ribeiro-123/?trk=abc")).toBe("marcos-ribeiro-123")
  })

  it("keeps two different slugs as different people", () => {
    expect(normalizeProfileSlug("https://www.linkedin.com/in/Ana-Silva-1")).not.toBe(normalizeProfileSlug("https://www.linkedin.com/in/Ana-Silva-2"))
  })

  it("verifies profile URLs in one bounded batch", () => {
    expect(buildBrazilProfileBatchInput(Array.from({ length: 30 }, (_, index) => `https://www.linkedin.com/in/pessoa-${index}`))).toMatchObject({
      profileScraperMode: "Profile details no email ($4 per 1k)",
      urls: Array.from({ length: 25 }, (_, index) => `https://www.linkedin.com/in/pessoa-${index}`),
    })
  })

  it("keeps only exact profiles returned by the bulk provider", () => {
    expect(requestedProfileSlugs(["https://www.linkedin.com/in/ana-silva"], [
      { linkedinUrl: "https://www.linkedin.com/in/ana-silva/?trk=public" },
    ])).toEqual(new Set(["ana-silva"]))
    expect(requestedProfileSlugs(["https://www.linkedin.com/in/ana-silva"], [
      { linkedinUrl: "https://www.linkedin.com/in/ana-silva-2" },
    ])).toEqual(new Set())
  })
})
