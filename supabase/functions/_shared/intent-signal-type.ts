export type PublicActivityKind = "comment" | "reaction" | "share" | "job_change"

const RECOMMENDATION_REQUEST = /\b(indica(?:m|ção|ções)?|recomenda(?:m|ção|ções)?|algu[eé]m\s+(?:usa|conhece)|procuro\s+(?:uma?|o)\s+(?:solu[cç][aã]o|fornecedor|parceiro)|qual\s+(?:fornecedor|solu[cç][aã]o))\b/i

/**
 * Classifies only the public event that was actually captured. This deliberately
 * has no fit score or inferred commercial outcome: the LLM remains responsible
 * for judging the literal evidence against the active ICP.
 */
export function signalTypeFromPublicActivity(input: {
  kind: PublicActivityKind
  evidence: string
  sourceRole?: "competitor" | "influencer" | null
}) {
  if (input.kind === "job_change") return "mudou_cargo" as const
  if (input.kind === "share") return "compartilhou_tema" as const
  if (input.sourceRole === "competitor") return "engajou_concorrente" as const
  if (input.sourceRole === "influencer") return "engajou_influenciador" as const
  if (input.kind === "reaction") return "atividade_fraca" as const
  if (RECOMMENDATION_REQUEST.test(input.evidence)) return "pediu_indicacao" as const
  return "comentou_tema" as const
}
