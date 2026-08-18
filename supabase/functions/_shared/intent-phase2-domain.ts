type RecordValue = Record<string, unknown>

export type BuyerProfile = {
  cargos?: unknown
  senioridades?: unknown
  setores?: unknown
  portes?: unknown
  regioes?: unknown
  exclusoes?: unknown
}

export type ApolloSeedCandidate = {
  apolloId: string
  name: string
  linkedinUrl: string
  headline: string | null
  title: string | null
  seniority: string | null
  country: string
  city: string | null
  state: string | null
  company: {
    name: string
    domain: string | null
    linkedinUrl: string | null
    industry: string | null
    employeeCount: number | null
  } | null
}

export type FitAssessment = {
  score: number
  excluded: boolean
  reasons: string[]
}

export function buildPersonJudgmentPayload(personId: string, candidateIds: string[], watchJobId: string) {
  const uniqueCandidateIds = [...new Set(candidateIds.filter(Boolean))]
  if (!personId || !watchJobId || !uniqueCandidateIds.length) throw new Error("A avaliação precisa de pessoa, ciclo e atividades válidas.")
  return { pessoa_id: personId, candidato_ids: uniqueCandidateIds, vigilia_job_id: watchJobId }
}

export function personJudgmentCreditReference(personId: string, watchJobId: string) {
  if (!personId || !watchJobId) throw new Error("A referência de crédito precisa da pessoa e do ciclo.")
  return `pessoa_julgada:${personId}:${watchJobId}`
}

const SIZE_RANGES: Record<string, string> = {
  "1-10": "1,10",
  "11-50": "11,50",
  "51-200": "51,200",
  "201-500": "201,500",
  "501-1000": "501,1000",
  "1001-5000": "1001,5000",
  "5001-10000": "5001,10000",
  "10000+": "10001,1000000",
}

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null
}

function text(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

function texts(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : []))]
}

function normalized(value: string | null | undefined) {
  return (value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function integer(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = Number(value)
    if (Number.isInteger(parsed) && parsed >= 0) return parsed
  }
  return null
}

function organizationOf(person: RecordValue) {
  return record(person.organization) ?? record(person.organization_data) ?? record(person.employment_history && Array.isArray(person.employment_history) ? person.employment_history[0] : null)
}

export function buildApolloPeopleSearchInput(buyer: BuyerProfile, perPage = 5) {
  const titles = texts(buyer.cargos).slice(0, 20)
  const seniorities = texts(buyer.senioridades).slice(0, 11)
  const sizes = texts(buyer.portes).flatMap((size) => SIZE_RANGES[size] ? [SIZE_RANGES[size]] : [])

  if (!titles.length) throw new Error("O perfil ideal precisa ter ao menos um cargo antes da descoberta.")

  return {
    person_titles: titles,
    person_seniorities: seniorities,
    person_locations: ["Brazil"],
    organization_locations: ["Brazil"],
    organization_num_employees_ranges: sizes,
    include_similar_titles: true,
    page: 1,
    per_page: Math.max(1, Math.min(10, Math.trunc(perPage))),
  }
}

export function apolloSearchPersonIds(payload: unknown): string[] {
  const root = record(payload)
  const people = root && Array.isArray(root.people) ? root.people : []
  return [...new Set(people.flatMap((value) => {
    const person = record(value)
    const id = person ? text(person.person_id, person.id) : null
    return id ? [id] : []
  }))]
}

export function normalizeEnrichedApolloPerson(payload: unknown): ApolloSeedCandidate | null {
  const root = record(payload)
  const person = record(root?.person)
  if (!person) return null

  const apolloId = text(person.id, person.person_id)
  const name = text(person.name, [text(person.first_name), text(person.last_name)].filter(Boolean).join(" "))
  const linkedinUrl = text(person.linkedin_url, person.linkedinUrl)
  const country = text(person.country, record(person.location)?.country)
  if (!apolloId || !name || !linkedinUrl || normalized(country) !== "brazil" && normalized(country) !== "brasil" && normalized(country) !== "br") return null
  if (!/^https?:\/\/(?:(?:www|[a-z]{2})\.)?linkedin\.com\/in\//i.test(linkedinUrl)) return null

  const organization = organizationOf(person)
  const companyName = organization ? text(organization.name, organization.organization_name) : null
  return {
    apolloId,
    name,
    linkedinUrl,
    headline: text(person.headline),
    title: text(person.title, person.job_title),
    seniority: text(person.seniority),
    country: country!,
    city: text(person.city),
    state: text(person.state),
    company: companyName && organization ? {
      name: companyName,
      domain: text(organization.primary_domain, organization.website_url, organization.domain)?.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? null,
      linkedinUrl: text(organization.linkedin_url),
      industry: text(organization.industry),
      employeeCount: integer(organization.estimated_num_employees, organization.num_employees),
    } : null,
  }
}

function titleMatches(actual: string | null, desired: string[]) {
  const candidate = normalized(actual)
  return desired.some((title) => {
    const expected = normalized(title)
    return expected.length >= 3 && (candidate.includes(expected) || expected.includes(candidate))
  })
}

function sizeBandMatches(count: number | null, bands: string[]) {
  if (count === null || !bands.length) return false
  return bands.some((band) => {
    if (band === "10000+") return count >= 10_000
    const [min, max] = band.split("-").map(Number)
    return Number.isFinite(min) && Number.isFinite(max) && count >= min && count <= max
  })
}

export function assessApolloFit(candidate: ApolloSeedCandidate, buyer: BuyerProfile): FitAssessment {
  const reasons: string[] = ["Brasil confirmado pelo enriquecimento regional"]
  let score = 25
  const titles = texts(buyer.cargos)
  const seniorities = texts(buyer.senioridades).map(normalized)
  const industries = Array.isArray(buyer.setores) ? buyer.setores.flatMap((value) => {
    const sector = record(value)
    return sector ? [text(sector.label_linkedin, sector.familia)].filter((item): item is string => Boolean(item)) : []
  }) : []
  const sizes = texts(buyer.portes)

  if (titleMatches(candidate.title ?? candidate.headline, titles)) {
    score += 35
    reasons.push("cargo aderente")
  }
  if (candidate.seniority && seniorities.includes(normalized(candidate.seniority))) {
    score += 15
    reasons.push("senioridade aderente")
  }
  if (candidate.company?.industry && industries.some((industry) => normalized(candidate.company!.industry).includes(normalized(industry)))) {
    score += 15
    reasons.push("setor aderente")
  }
  if (sizeBandMatches(candidate.company?.employeeCount ?? null, sizes)) {
    score += 10
    reasons.push("porte aderente")
  }

  const exclusionText = Array.isArray(buyer.exclusoes)
    ? buyer.exclusoes.map((item) => record(item)).filter(Boolean).map((item) => `${text(item!.tipo) ?? ""} ${text(item!.valor) ?? ""}`)
    : []
  const haystack = normalized(`${candidate.name} ${candidate.headline ?? ""} ${candidate.title ?? ""} ${candidate.company?.name ?? ""} ${candidate.company?.domain ?? ""}`)
  const excluded = exclusionText.some((rule) => {
    const [type, ...rest] = rule.split(" ")
    const value = normalized(rest.join(" "))
    return type === "open_to_work" && haystack.includes("open to work") || value.length >= 3 && haystack.includes(value)
  })
  if (excluded) reasons.push("regra de exclusão aplicada")

  return { score: Math.min(100, score), excluded, reasons }
}

export function stripApolloContactFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripApolloContactFields)
  const item = record(value)
  if (!item) return value
  const safe: RecordValue = {}
  for (const [key, child] of Object.entries(item)) {
    if (/email|phone|mobile|contact/i.test(key)) continue
    safe[key] = stripApolloContactFields(child)
  }
  return safe
}
