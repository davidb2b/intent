import { describe, expect, it } from "vitest"
import { buildBrazilProfileBatchInput, isBrazilianProfile, requestedProfileSlugs } from "../../../../supabase/functions/_shared/brazil-profile-verification"
import { brazilRelevanceScore, buildBrazilFirstQueries, isLinkedInPersonProfileUrl } from "../../../../supabase/functions/_shared/brazil-first-discovery"
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

  it("accepts explicit Brazilian provider locations and rejects foreign ones", () => {
    expect(isBrazilianProfile({
      linkedinUrl: "https://www.linkedin.com/in/perfil-brasileiro",
      location: {
        linkedinText: "São Paulo, São Paulo, Brazil",
        countryCode: "BR",
        parsed: { countryCode: "BR", country: "Brazil" },
      },
    })).toBe(true)

    expect(isBrazilianProfile({
      linkedinUrl: "https://www.linkedin.com/in/perfil-estrangeiro",
      location: {
        linkedinText: "Kyiv Metropolitan Area",
        countryCode: "UA",
        parsed: { countryCode: "UA", country: "Ukraine" },
      },
    })).toBe(false)
  })

  it("prioritizes Brazil in discovery without accepting company pages as profiles", () => {
    expect(buildBrazilFirstQueries(["cost breakdown", "compras"])).toEqual(["cost breakdown", "compras"])
    expect(isLinkedInPersonProfileUrl("https://www.linkedin.com/in/pessoa-brasileira")).toBe(true)
    expect(isLinkedInPersonProfileUrl("https://www.linkedin.com/company/empresa-brasileira")).toBe(false)
    expect(brazilRelevanceScore("Compras estratégicas no Brasil e em São Paulo")).toBeGreaterThan(0)
    expect(brazilRelevanceScore("Procurement strategy in Europe")).toBe(0)
  })
})
