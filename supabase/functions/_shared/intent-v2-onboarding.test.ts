import { describe, expect, it } from "vitest"
import {
  extractLinkedInCompanyUrl,
  mergeV2CompanySources,
  normalizeApolloOrganization,
  normalizeLinkedInCompany,
  normalizeLinkedInCompanyUrl,
  safeApolloOrganizationPayload,
} from "./intent-v2-onboarding"

describe("Intent v2 onboarding discovery", () => {
  it("keeps the first public company page and ignores a personal profile", () => {
    expect(normalizeLinkedInCompanyUrl("https://www.linkedin.com/in/ana")).toBeNull()
    expect(extractLinkedInCompanyUrl([
      { url: "https://acme.com", content: "Conheça a equipe: https://www.linkedin.com/in/ana" },
      { url: "https://acme.com/about", content: "Nossa página: https://linkedin.com/company/acme-br/?trk=site" },
    ])).toBe("https://www.linkedin.com/company/acme-br")
  })

  it("normalizes Apollo using only public firmography", () => {
    const value = normalizeApolloOrganization({
      organization: {
        name: "Acme",
        short_description: "Serviços B2B",
        industry: "Software",
        estimated_num_employees: 51,
        city: "São Paulo",
        country: "Brazil",
        linkedin_url: "https://www.linkedin.com/company/acme",
        primary_domain: "acme.com",
        email: "private@example.com",
      },
    })
    expect(value.name).toBe("Acme")
    expect(value.employeeCount).toBe(51)
    expect(value.linkedinUrl).toBe("https://www.linkedin.com/company/acme")
    expect(safeApolloOrganizationPayload({ organization: { name: "Acme", email: "private@example.com" } })).not.toHaveProperty("organization.email")
  })

  it("lets LinkedIn win firmography while Apollo remains a fallback", () => {
    const merged = mergeV2CompanySources({
      siteUrl: "https://acme.com",
      sitePages: [{ url: "https://acme.com", content: "Produto" }],
      linkedinUrl: "https://www.linkedin.com/company/acme",
      apollo: normalizeApolloOrganization({ organization: { name: "Acme Apollo", industry: "Software", city: "Curitiba", primary_domain: "acme.com" } }),
      linkedin: normalizeLinkedInCompany([{ name: "Acme LinkedIn", industry: "Consultoria", city: "São Paulo", country: "Brazil", companySize: "51-200" }]),
    })
    expect(merged.nome).toBe("Acme LinkedIn")
    expect(merged.setor).toBe("Consultoria")
    expect(merged.porte).toBe("51-200")
    expect(merged.localizacao).toBe("São Paulo, Brazil")
    expect(merged.fontes.map((source) => source.kind)).toEqual(["site", "apollo", "linkedin"])
  })
})
