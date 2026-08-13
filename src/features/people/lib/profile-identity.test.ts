import { describe, expect, it } from "vitest"
import { buildBrazilProfileBatchInput, isBrazilianProfile, requestedProfileSlugs } from "../../../../supabase/functions/_shared/brazil-profile-verification"
import { brazilRelevanceScore, buildBrazilFirstQueries, buildBrazilProfileSearchInput, isLinkedInPersonProfileUrl } from "../../../../supabase/functions/_shared/brazil-first-discovery"
import { canonicalProfileUrl, normalizeProfileSlug } from "../../../../supabase/functions/_shared/profile-identity"
import { buildMonitoredProfilePostsInput, MONITORED_PROFILE_POSTS_ACTOR } from "../../../../supabase/functions/_shared/monitoring-posts"

describe("profile identity", () => {
  it("canonicalizes LinkedIn profile URLs into one slug", () => {
    expect(normalizeProfileSlug("https://www.linkedin.com/in/Marcos-Ribeiro-123/?trk=abc")).toBe("marcos-ribeiro-123")
    expect(canonicalProfileUrl("https://www.linkedin.com/in/Marcos-Ribeiro-123/?trk=abc")).toBe("https://www.linkedin.com/in/marcos-ribeiro-123")
  })

  it("uses Profile Posts and targetUrls for approved monitoring sources", () => {
    expect(MONITORED_PROFILE_POSTS_ACTOR).toBe("harvestapi/linkedin-profile-posts")
    expect(buildMonitoredProfilePostsInput([
      "https://www.linkedin.com/in/Marcos-Ribeiro-123/?trk=abc",
      "https://www.linkedin.com/in/marcos-ribeiro-123",
    ], "month")).toEqual({
      targetUrls: ["https://www.linkedin.com/in/marcos-ribeiro-123"],
      maxPosts: 200,
      postedLimit: "month",
      scrapeComments: false,
      scrapeReactions: false,
    })
  })

  it("keeps two different slugs as different people", () => {
    expect(normalizeProfileSlug("https://www.linkedin.com/in/Ana-Silva-1")).not.toBe(normalizeProfileSlug("https://www.linkedin.com/in/Ana-Silva-2"))
  })

  it("verifies profile URLs in one bounded batch", () => {
    expect(buildBrazilProfileBatchInput(Array.from({ length: 30 }, (_, index) => `https://www.linkedin.com/in/pessoa-${index}`))).toMatchObject({
      profileScraperMode: "Profile details no email ($4 per 1k)",
      queries: Array.from({ length: 25 }, (_, index) => `https://www.linkedin.com/in/pessoa-${index}`),
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
    expect(buildBrazilFirstQueries(["cost breakdown", "compras"])).toEqual(["cost breakdown", "cost breakdown Brasil", "compras", "compras Brasil"])
    expect(buildBrazilProfileSearchInput(["cost breakdown"])).toMatchObject({ searchQuery: "cost breakdown", locations: ["Brazil"], maxItems: 25 })
    expect(isLinkedInPersonProfileUrl("https://www.linkedin.com/in/pessoa-brasileira")).toBe(true)
    expect(isLinkedInPersonProfileUrl("https://www.linkedin.com/company/empresa-brasileira")).toBe(false)
    expect(brazilRelevanceScore("Compras estratégicas no Brasil e em São Paulo")).toBeGreaterThan(0)
    expect(brazilRelevanceScore("Procurement strategy in Europe")).toBe(0)
  })
})
