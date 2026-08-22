export type IntentV2BinaryBuyer = {
  cargos?: unknown
}

export type IntentV2BinaryGateInput = {
  buyer: IntentV2BinaryBuyer | null | undefined
  country?: unknown
  locationConfirmed?: unknown
  title?: unknown
  headline?: unknown
  excluded?: unknown
}

export type IntentV2BinaryGateReason =
  | "aprovado"
  | "localizacao_nao_confirmada_no_brasil"
  | "perfil_excluido_pelo_icp"
  | "cargo_fora_do_perfil_ideal"

export type IntentV2BinaryGateResult = {
  approved: boolean
  brasilConfirmado: boolean
  excluded: boolean
  cargoCompativel: boolean
  reason: IntentV2BinaryGateReason
  evidence: string[]
}

function normalize(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim()
    : ""
}

function titles(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : []))]
    : []
}

function matchesTitle(actual: string, expected: string) {
  if (actual.length < 3 || expected.length < 3) return false
  return actual.includes(expected) || expected.includes(actual)
}

export function evaluateIntentV2BinaryGate(input: IntentV2BinaryGateInput): IntentV2BinaryGateResult {
  const country = normalize(input.country)
  const brasilConfirmado = input.locationConfirmed === true || ["brasil", "brazil", "br", "brasil (br)"].includes(country)
  const excluded = input.excluded === true
  const targetTitles = titles(input.buyer?.cargos).map(normalize).filter((title) => title.length >= 3)
  const publicTitle = [normalize(input.title), normalize(input.headline)].filter(Boolean).join(" · ")
  const cargoCompativel = targetTitles.some((target) => matchesTitle(publicTitle, target))

  if (!brasilConfirmado) {
    return { approved: false, brasilConfirmado, excluded, cargoCompativel, reason: "localizacao_nao_confirmada_no_brasil", evidence: ["A localização pública não confirmou Brasil."] }
  }
  if (excluded) {
    return { approved: false, brasilConfirmado, excluded, cargoCompativel, reason: "perfil_excluido_pelo_icp", evidence: ["O perfil foi excluído pelas regras vigentes do perfil ideal."] }
  }
  if (!cargoCompativel) {
    return { approved: false, brasilConfirmado, excluded, cargoCompativel, reason: "cargo_fora_do_perfil_ideal", evidence: ["O cargo público não corresponde aos cargos definidos no perfil ideal."] }
  }
  return { approved: true, brasilConfirmado, excluded, cargoCompativel, reason: "aprovado", evidence: ["Brasil confirmado.", "Cargo público aderente ao perfil ideal."] }
}
