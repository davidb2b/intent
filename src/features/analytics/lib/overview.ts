import type { SignalComment, SignalCompany, SignalPost, SignalSource } from "@/features/analytics/services/load-signals"

export type OverviewMetrics = {
  discoveredSources: number
  collectedPosts: number
  observedPeople: number
  collectedComments: number
  identifiedCompanies: number
}

function normalized(value: string | null) {
  return value?.trim().toLocaleLowerCase("pt-BR") ?? ""
}

export function getOverviewMetrics(
  posts: SignalPost[],
  sources: SignalSource[],
  comments: SignalComment[],
  companies: SignalCompany[],
): OverviewMetrics {
  const observedPeople = new Set(
    comments
      .map((comment) => comment.personUrl || comment.personName)
      .filter(Boolean),
  )

  return {
    discoveredSources: sources.length,
    collectedPosts: posts.length,
    observedPeople: observedPeople.size,
    collectedComments: comments.length,
    identifiedCompanies: companies.length,
  }
}

export function getUsefulComments(comments: SignalComment[], limit = 4) {
  const classifiedSignals = comments.filter((comment) => Boolean(comment.tone) && normalized(comment.tone) !== "generico")
  return (classifiedSignals.length > 0 ? classifiedSignals : comments).slice(0, limit)
}

export function getTopCompanies(companies: SignalCompany[], limit = 5) {
  return [...companies]
    .sort((first, second) => second.comments - first.comments || second.people - first.people || first.name.localeCompare(second.name, "pt-BR"))
    .slice(0, limit)
}
