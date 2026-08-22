export type IntentV2SitePage = {
  url: string
  content: string
}

export type IntentV2Evidence = {
  kind: "site" | "apollo" | "linkedin"
  url: string
}

export type IntentV2CompanyDiscovery = {
  nome: string | null
  resumo: string | null
  setor: string | null
  porte: string | null
  localizacao: string | null
  siteUrl: string
  linkedinUrl: string | null
  fontes: IntentV2Evidence[]
}

export type PublicOrganization = {
  name: string | null
  summary: string | null
  industry: string | null
  employeeCount: number | null
  companySize: string | null
  foundedYear: number | null
  city: string | null
  state: string | null
  country: string | null
  domain: string | null
  linkedinUrl: string | null
}

export type PublicLinkedInCompany = PublicOrganization

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized ? normalized : null
}

function positiveInteger(...values: unknown[]): number | null {
  for (const value of values) {
    const number = typeof value === "number" ? value : Number(value)
    if (Number.isInteger(number) && number > 0) return number
  }
  return null
}

function firstObject(...values: unknown[]): Record<string, unknown> {
  return values.find((value): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value))) ?? {}
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = nonEmptyString(value)
    if (normalized) return normalized
  }
  return null
}

function asPublicLinkedInUrl(value: unknown): string | null {
  return typeof value === "string" ? normalizeLinkedInCompanyUrl(value) : null
}

export function normalizeLinkedInCompanyUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  try {
    const candidate = new URL(value.trim())
    if (candidate.protocol !== "http:" && candidate.protocol !== "https:") return null
    if (!candidate.hostname.toLowerCase().endsWith("linkedin.com")) return null
    const match = candidate.pathname.match(/^\/company\/([^/?#]+)\/?$/i)
    if (!match) return null
    const slug = decodeURIComponent(match[1]).trim()
    if (!slug) return null
    return `https://www.linkedin.com/company/${encodeURIComponent(slug)}`
  } catch {
    return null
  }
}

export function extractLinkedInCompanyUrl(pages: IntentV2SitePage[]): string | null {
  const companyUrlPattern = /https?:\/\/(?:[a-z]{2}\.)?(?:www\.)?linkedin\.com\/company\/[^\s)\]}>"']+/gi
  for (const page of pages) {
    const direct = normalizeLinkedInCompanyUrl(page.url)
    if (direct) return direct
    const contentMatch = page.content.match(companyUrlPattern)
    const fromContent = contentMatch?.map((candidate) => normalizeLinkedInCompanyUrl(candidate.replace(/[.,;:!?]+$/, ""))).find(Boolean)
    if (fromContent) return fromContent
  }
  return null
}

function locationFrom(source: Partial<PublicOrganization> | null): string | null {
  if (!source) return null
  const parts = [source.city, source.state, source.country].filter(Boolean)
  return parts.length ? parts.join(", ") : null
}

function organizationFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return firstObject(payload.organization, payload.organisation, payload.data)
}

export function normalizeApolloOrganization(payload: Record<string, unknown>): PublicOrganization {
  const organization = organizationFromPayload(payload)
  const headquarters = firstObject(organization.headquarters, organization.location)
  const linkedinUrl = asPublicLinkedInUrl(firstString(organization.linkedin_url, organization.linkedinUrl))
  return {
    name: firstString(organization.name, organization.organization_name),
    summary: firstString(organization.short_description, organization.description, organization.summary),
    industry: firstString(organization.industry, organization.industry_name),
    employeeCount: positiveInteger(organization.estimated_num_employees, organization.employee_count, organization.staff_count),
    companySize: firstString(organization.company_size, organization.size),
    foundedYear: positiveInteger(organization.founded_year),
    city: firstString(organization.city, headquarters.city),
    state: firstString(organization.state, organization.state_name, headquarters.state),
    country: firstString(organization.country, organization.country_name, headquarters.country),
    domain: firstString(organization.primary_domain, organization.domain, organization.website_domain),
    linkedinUrl,
  }
}

export function normalizeLinkedInCompany(items: unknown[]): PublicLinkedInCompany | null {
  const item = items.find((value): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value)))
  if (!item) return null
  const company = firstObject(item.company, item.organization, item)
  const headquarters = firstObject(company.headquarters, company.location)
  return {
    name: firstString(company.name, company.companyName),
    summary: firstString(company.description, company.shortDescription, company.summary),
    industry: firstString(company.industry, company.sector),
    employeeCount: positiveInteger(company.staffCount, company.employeeCount, company.estimatedNumEmployees),
    companySize: firstString(company.companySize, company.size),
    foundedYear: positiveInteger(company.founded, company.foundedYear),
    city: firstString(company.city, headquarters.city),
    state: firstString(company.state, headquarters.state),
    country: firstString(company.country, headquarters.country),
    domain: firstString(company.website, company.domain),
    linkedinUrl: asPublicLinkedInUrl(firstString(company.linkedinUrl, company.linkedin_url, company.url)),
  }
}

export function hasConfirmedFirmography(organization: PublicOrganization | null): boolean {
  if (!organization) return false
  return Boolean(
    organization.name
    || organization.summary
    || organization.industry
    || organization.employeeCount
    || organization.companySize
    || organization.city
    || organization.state
    || organization.country
    || organization.domain
    || organization.linkedinUrl,
  )
}

function uniqueSources(sources: IntentV2Evidence[]): IntentV2Evidence[] {
  const seen = new Set<string>()
  return sources.filter((source) => {
    const key = `${source.kind}:${source.url}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function preferred(...values: Array<string | null | undefined>): string | null {
  return values.find(Boolean) ?? null
}

export function mergeV2CompanySources({
  siteUrl,
  sitePages,
  apollo,
  linkedin,
  linkedinUrl,
}: {
  siteUrl: string
  sitePages: IntentV2SitePage[]
  apollo: PublicOrganization | null
  linkedin: PublicLinkedInCompany | null
  linkedinUrl: string | null
}): IntentV2CompanyDiscovery {
  const confirmedLinkedInUrl = linkedinUrl ?? linkedin?.linkedinUrl ?? apollo?.linkedinUrl ?? null
  const companySize = preferred(linkedin?.companySize, apollo?.companySize)
  const employeeCount = linkedin?.employeeCount ?? apollo?.employeeCount
  const porte = companySize ?? (employeeCount ? String(employeeCount) : null)
  const selectedLocation = locationFrom(linkedin) ?? locationFrom(apollo)
  const sources: IntentV2Evidence[] = [{ kind: "site", url: siteUrl }, ...sitePages.slice(0, 4).map((page) => ({ kind: "site" as const, url: page.url }))]
  if (apollo) sources.push({ kind: "apollo", url: apollo.domain ? `https://${apollo.domain}` : "https://www.apollo.io" })
  if (confirmedLinkedInUrl) sources.push({ kind: "linkedin", url: confirmedLinkedInUrl })
  return {
    nome: preferred(linkedin?.name ?? null, apollo?.name ?? null),
    resumo: preferred(linkedin?.summary ?? null, apollo?.summary ?? null),
    setor: preferred(linkedin?.industry ?? null, apollo?.industry ?? null),
    porte,
    localizacao: selectedLocation,
    siteUrl,
    linkedinUrl: confirmedLinkedInUrl,
    fontes: uniqueSources(sources),
  }
}

export function safeApolloOrganizationPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const organization = normalizeApolloOrganization(payload)
  return {
    organization: {
      name: organization.name,
      short_description: organization.summary,
      industry: organization.industry,
      estimated_num_employees: organization.employeeCount,
      company_size: organization.companySize,
      founded_year: organization.foundedYear,
      city: organization.city,
      state: organization.state,
      country: organization.country,
      primary_domain: organization.domain,
      linkedin_url: organization.linkedinUrl,
    },
  }
}
