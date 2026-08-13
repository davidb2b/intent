function normalized(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")
}

function contextTerms(value: string | null | undefined) {
  return (value ?? "")
    .split(/[;,\n]/)
    .map((term) => normalized(term).trim())
    .filter((term) => term.length >= 3)
}

/** A post must explicitly mention the active theme and never an excluded context. */
export function matchesTopic(input: { text?: string | null; keyword: string; positiveContext?: string | null; negativeContext?: string | null }) {
  const text = normalized(input.text)
  const keyword = normalized(input.keyword).trim()
  if (!text || !keyword || !text.includes(keyword)) return false

  const excluded = contextTerms(input.negativeContext)
  if (excluded.some((term) => text.includes(term))) return false

  const requiredContext = contextTerms(input.positiveContext)
  return requiredContext.length === 0 || requiredContext.some((term) => text.includes(term))
}
