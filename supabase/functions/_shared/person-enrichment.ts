const ICP_TERMS = ["suprimento", "compras", "procurement", "sourcing", "supply chain", "contratos", "categoria", "controladoria"]
const DIRECTOR_TERMS = ["diretor", "director", "head", "cpo", "vp", "vice-presidente", "c-level", "chief"]
const MANAGER_TERMS = ["gerente", "manager", "coordenador", "supervisor", "líder", "lead"]
const ANALYST_TERMS = ["analista", "especialista", "analyst", "specialist", "assistente"]
const COMPANY_SUFFIXES = /\b(s\.?a\.?|ltda\.?|me\.?|eireli|inc\.?|llc|corp\.?|corporation)\b/g

export type PersonClassification = {
  senioridade: "diretoria" | "gerencia" | "analista" | "fora"
  icp: boolean
  icpMotivo: string
}

function normalize(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

/**
 * An identity without a display name is not useful for human review and must
 * never become a visible source, person or comment author.
 */
export function usablePersonName(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const name = value?.replace(/\s+/g, " ").trim()
    if (!name || name.length < 2) continue
    if (["perfil sem nome", "unknown", "n/a"].includes(normalize(name))) continue
    return name
  }
  return null
}

function containsAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(normalize(term)))
}

export function normalizeCompanyKey(value: string) {
  return normalize(value).replace(COMPANY_SUFFIXES, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ")
}

export function classifyAutomatedPerson(input: { headline?: string | null; cargo?: string | null; empresa?: string | null }): PersonClassification {
  const text = normalize(`${input.headline ?? ""} ${input.cargo ?? ""}`)
  const senioridade = containsAny(text, DIRECTOR_TERMS)
    ? "diretoria"
    : containsAny(text, MANAGER_TERMS)
      ? "gerencia"
      : containsAny(text, ANALYST_TERMS)
        ? "analista"
        : "fora"
  if (containsAny(text, ["consultor", "consultoria", "socio", "partner", "advisor", "mentor", "coach"])) return { senioridade, icp: false, icpMotivo: "consultoria" }
  if (containsAny(text, ["vendas", "comercial", "account executive", "sales", "business development", "sdr", "pre-sales"])) return { senioridade, icp: false, icpMotivo: "fornecedor" }
  if (containsAny(text, ["estudante", "student", "estagiari", "trainee", "graduando"])) return { senioridade, icp: false, icpMotivo: "estudante" }
  if (!input.empresa?.trim()) return { senioridade, icp: false, icpMotivo: "sem_empresa" }
  if (senioridade === "fora") return { senioridade, icp: false, icpMotivo: "senioridade_fora" }
  if (!containsAny(text, ICP_TERMS)) return { senioridade, icp: false, icpMotivo: "cargo_fora_do_escopo" }
  return { senioridade, icp: true, icpMotivo: "aderente" }
}

/** Fields produced by the provider that are safe to refresh after a human review. */
export function personPersistencePayload(input: {
  linkedinUrl: string
  slug: string
  name: string
  headline: string | null
  cargo: string | null
  companyId: string | null
  companyName: string | null
  reviewedByHuman: boolean
}) {
  const identity = {
    linkedin_url: input.linkedinUrl,
    slug: input.slug,
    nome: input.name,
    headline: input.headline,
    empresa_id: input.companyId,
  }
  if (input.reviewedByHuman) return identity
  const classification = classifyAutomatedPerson({ headline: input.headline, cargo: input.cargo, empresa: input.companyName })
  return {
    ...identity,
    cargo: input.cargo,
    senioridade: classification.senioridade,
    icp: classification.icp,
    icp_motivo: classification.icpMotivo,
  }
}
