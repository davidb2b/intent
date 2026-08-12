const ICP_TERMS = ["suprimento", "compras", "procurement", "sourcing", "supply chain", "contratos", "categoria", "controladoria"]
const DIRECTOR_TERMS = ["diretor", "director", "head", "cpo", "vp", "vice-presidente", "c-level", "chief"]
const MANAGER_TERMS = ["gerente", "manager", "coordenador", "supervisor", "líder", "lead"]
const ANALYST_TERMS = ["analista", "especialista", "analyst", "specialist", "assistente"]

export type PersonClassificationInput = {
  headline?: string | null
  cargo?: string | null
  empresa?: string | null
}

export type PersonClassification = {
  senioridade: "diretoria" | "gerencia" | "analista" | "fora"
  icp: boolean
  icpMotivo: string
}

function normalize(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function containsAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(normalize(term)))
}

export function classifyPerson({ headline, cargo, empresa }: PersonClassificationInput): PersonClassification {
  const text = normalize(`${headline ?? ""} ${cargo ?? ""}`)
  const senioridade = containsAny(text, DIRECTOR_TERMS)
    ? "diretoria"
    : containsAny(text, MANAGER_TERMS)
      ? "gerencia"
      : containsAny(text, ANALYST_TERMS)
        ? "analista"
        : "fora"

  if (containsAny(text, ["consultor", "consultoria", "socio", "partner", "advisor", "mentor", "coach"])) {
    return { senioridade, icp: false, icpMotivo: "consultoria" }
  }
  if (containsAny(text, ["vendas", "comercial", "account executive", "sales", "business development", "sdr", "pre-sales"])) {
    return { senioridade, icp: false, icpMotivo: "fornecedor" }
  }
  if (containsAny(text, ["estudante", "student", "estagiari", "trainee", "graduando"])) {
    return { senioridade, icp: false, icpMotivo: "estudante" }
  }
  if (!empresa?.trim()) return { senioridade, icp: false, icpMotivo: "sem_empresa" }
  if (senioridade === "fora") return { senioridade, icp: false, icpMotivo: "senioridade_fora" }
  if (!containsAny(text, ICP_TERMS)) return { senioridade, icp: false, icpMotivo: "cargo_fora_do_escopo" }
  return { senioridade, icp: true, icpMotivo: "aderente" }
}
