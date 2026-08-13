import type { SignalCompany } from "@/features/analytics/services/load-signals"

export type CompanySort = "comments" | "people" | "name"

export type CompanyResultFilters = {
  search: string
  sector: string
  sort: CompanySort
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("pt-BR") ?? ""
}

export function getCompanySectors(companies: SignalCompany[]) {
  return [...new Set(companies.flatMap((company) => company.sector?.trim() ? [company.sector.trim()] : []))]
    .sort((first, second) => first.localeCompare(second, "pt-BR"))
}

export function filterCompanyResults(companies: SignalCompany[], filters: CompanyResultFilters) {
  const search = normalize(filters.search)
  const sector = normalize(filters.sector)

  return companies
    .filter((company) => {
      const matchesSearch = !search || [company.name, company.sector, company.size].some((value) => normalize(value).includes(search))
      const matchesSector = !sector || sector === "all" || normalize(company.sector) === sector
      return matchesSearch && matchesSector
    })
    .sort((first, second) => {
      if (filters.sort === "name") return first.name.localeCompare(second.name, "pt-BR")
      if (filters.sort === "people") return second.people - first.people || second.comments - first.comments || first.name.localeCompare(second.name, "pt-BR")
      return second.comments - first.comments || second.people - first.people || first.name.localeCompare(second.name, "pt-BR")
    })
}
