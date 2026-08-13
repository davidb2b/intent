import { describe, expect, it } from "vitest"
import { classifyAutomatedPerson, normalizeCompanyKey, personPersistencePayload } from "../../../../supabase/functions/_shared/person-enrichment"

describe("person enrichment", () => {
  it("normalizes company keys before persistence", () => {
    expect(normalizeCompanyKey("Acme Brasil Ltda.")).toBe("acme brasil")
    expect(normalizeCompanyKey("ACME-Brasil S.A.")).toBe("acme brasil")
  })

  it("classifies an eligible person automatically when a company exists", () => {
    expect(classifyAutomatedPerson({ headline: "Head de Compras", empresa: "Indústria Acme" })).toMatchObject({
      senioridade: "diretoria",
      icp: true,
      icpMotivo: "aderente",
    })
  })

  it("does not overwrite human cargo, seniority or ICP decisions", () => {
    const payload = personPersistencePayload({
      linkedinUrl: "https://www.linkedin.com/in/ana",
      slug: "ana",
      name: "Ana",
      headline: "Head de Compras",
      cargo: "Head de Compras",
      companyId: "company-1",
      companyName: "Indústria Acme",
      reviewedByHuman: true,
    })
    expect(payload).toEqual({
      linkedin_url: "https://www.linkedin.com/in/ana",
      slug: "ana",
      nome: "Ana",
      headline: "Head de Compras",
      empresa_id: "company-1",
    })
  })
})
