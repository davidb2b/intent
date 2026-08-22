/**
 * Fase 4 do Intent v2: a IA só recebe comentários que já têm contexto do
 * post e relação literal com os termos de compra do ICP. Esta etapa é
 * determinística e não consome créditos.
 */

export type CommentHygieneDecision =
  | { decision: "approved"; reason: null; matchedTerms: string[] }
  | { decision: "awaiting_post_context"; reason: "contexto_post_ausente"; matchedTerms: [] }
  | { decision: "discarded"; reason: "comentario_de_cortesia" | "comentario_fora_do_tema" | "perfil_sem_termos"; matchedTerms: [] }

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export function normalizeIntentText(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim()
}

function uniqueTerms(values: unknown[]) {
  const seen = new Set<string>()
  const terms: string[] = []
  for (const value of values) {
    const literal = text(value)
    const normalized = normalizeIntentText(literal)
    // Siglas como IA e BI são termos válidos de intenção; apenas termos de
    // uma letra são amplos demais para o filtro literal.
    if (normalized.length < 2 || seen.has(normalized)) continue
    seen.add(normalized)
    terms.push(literal)
  }
  return terms
}

/** Supports both the v2 `termos` contract and the legacy v1 rule contract. */
export function extractIntentSignalTerms(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  const source = value as Record<string, unknown>
  const v2Terms = Array.isArray(source.termos) ? source.termos : []
  const v1Terms = Array.isArray(source.regras)
    ? source.regras.flatMap((rule) => {
      if (!rule || typeof rule !== "object" || Array.isArray(rule)) return []
      const words = (rule as Record<string, unknown>).palavras_chave
      return Array.isArray(words) ? words : []
    })
    : []
  return uniqueTerms([...v2Terms, ...v1Terms])
}

export function mergeIntentSignalTerms(...groups: string[][]) {
  return uniqueTerms(groups.flat())
}

function isCourtesyOnly(comment: string) {
  const normalized = normalizeIntentText(comment)
  if (!normalized) return true
  const withoutMentions = normalized.replace(/@[\p{L}\p{N}_.-]+/gu, "").trim()
  const words = withoutMentions.match(/[\p{L}\p{N}]+/gu) ?? []
  if (words.length === 0) return true
  const courtesyWords = new Set([
    "parabens", "parabenss", "top", "excelente", "incrivel", "show", "sensacional",
    "sucesso", "sucessos", "bravo", "arrasou", "lindo", "legal", "demais", "massa",
  ])
  return words.length <= 4 && words.every((word) => courtesyWords.has(word))
}

function hasLiteralTerm(haystack: string, term: string) {
  const normalizedTerm = normalizeIntentText(term)
  if (!normalizedTerm) return false
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "u").test(haystack)
}

export function assessCommentForIntent(input: { comment: unknown; postText: unknown; terms: string[] }): CommentHygieneDecision {
  const comment = text(input.comment)
  const postText = text(input.postText)
  if (!postText) return { decision: "awaiting_post_context", reason: "contexto_post_ausente", matchedTerms: [] }
  if (isCourtesyOnly(comment)) return { decision: "discarded", reason: "comentario_de_cortesia", matchedTerms: [] }
  if (input.terms.length === 0) return { decision: "discarded", reason: "perfil_sem_termos", matchedTerms: [] }

  const source = `${normalizeIntentText(comment)} ${normalizeIntentText(postText)}`.trim()
  const matchedTerms = input.terms.filter((term) => hasLiteralTerm(source, term))
  if (matchedTerms.length === 0) return { decision: "discarded", reason: "comentario_fora_do_tema", matchedTerms: [] }
  return { decision: "approved", reason: null, matchedTerms }
}
