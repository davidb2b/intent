import type { SignalComment, SignalCompany, SignalPost, SignalSource } from "@/features/analytics/services/load-signals"

export type OverviewMetrics = {
  initialResults: number
  approvedPosts: number
  monitoredAuthors: number
  analyzedComments: number
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
  discoveredPosts: SignalPost[],
): OverviewMetrics {
  return {
    initialResults: discoveredPosts.length,
    approvedPosts: [...discoveredPosts, ...posts].filter((post) => post.curationStatus === "aprovado").length,
    monitoredAuthors: sources.filter((source) => source.status === "monitorada").length,
    analyzedComments: comments.filter((comment) => Boolean(comment.tone)).length,
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
