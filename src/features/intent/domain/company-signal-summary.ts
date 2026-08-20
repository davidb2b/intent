export type CompanyActivityLevel = "em_movimento" | "aquecendo" | "fria"

export type CompanySignalDigest = {
  personId: string
  role: string | null
  type: string
  occurredAt: string | null
}

const signalActions: Record<string, string> = {
  comentou_tema: "comentou sobre tema do ICP",
  pediu_indicacao: "pediu indicação de fornecedor",
  mudou_cargo: "mudou de cargo",
  engajou_concorrente: "interagiu com conteúdo de concorrente",
  engajou_influenciador: "engajou com perfil da watchlist",
  compartilhou_tema: "compartilhou conteúdo sobre tema do ICP",
  atividade_fraca: "reagiu a posts sobre temas do ICP",
}

export function companyActivityLevel(peopleWithSignals: number): CompanyActivityLevel {
  if (peopleWithSignals >= 2) return "em_movimento"
  if (peopleWithSignals === 1) return "aquecendo"
  return "fria"
}

export function buildCompanySignalSummary(signals: CompanySignalDigest[], limit = 2): string | null {
  const seenPeople = new Set<string>()
  const descriptions: string[] = []

  for (const signal of [...signals].sort((first, second) => (second.occurredAt ?? "").localeCompare(first.occurredAt ?? ""))) {
    if (seenPeople.has(signal.personId)) continue
    seenPeople.add(signal.personId)
    const subject = signal.role?.trim() || "Uma pessoa"
    const action = signalActions[signal.type] ?? "apresentou um sinal público"
    descriptions.push(`${subject} ${action}`)
    if (descriptions.length === limit) break
  }

  return descriptions.length > 0 ? descriptions.join(" · ") : null
}
