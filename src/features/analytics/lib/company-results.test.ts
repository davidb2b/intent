import { describe, expect, it } from "vitest"

import { filterCompanyResults, getCompanySectors } from "./company-results"

const companies = [
  { id: "1", name: "Árvore Tecnologia", sector: "Tecnologia", size: "51-200", linkedinUrl: null, people: 2, comments: 4 },
  { id: "2", name: "Banco do Brasil", sector: "Serviços financeiros", size: "10.001+", linkedinUrl: null, people: 5, comments: 3 },
  { id: "3", name: "Nuvem Saúde", sector: "Tecnologia", size: null, linkedinUrl: null, people: 1, comments: 6 },
]

describe("company result controls", () => {
  it("filters by real company fields and keeps the selected sector", () => {
    expect(filterCompanyResults(companies, { search: "saúde", sector: "tecnologia", sort: "comments" }).map((company) => company.id)).toEqual(["3"])
    expect(filterCompanyResults(companies, { search: "", sector: "serviços financeiros", sort: "comments" }).map((company) => company.id)).toEqual(["2"])
  })

  it("orders by the requested real metric", () => {
    expect(filterCompanyResults(companies, { search: "", sector: "all", sort: "comments" }).map((company) => company.id)).toEqual(["3", "1", "2"])
    expect(filterCompanyResults(companies, { search: "", sector: "all", sort: "people" }).map((company) => company.id)).toEqual(["2", "1", "3"])
  })

  it("derives filter options only from persisted sectors", () => {
    expect(getCompanySectors(companies)).toEqual(["Serviços financeiros", "Tecnologia"])
  })
})
