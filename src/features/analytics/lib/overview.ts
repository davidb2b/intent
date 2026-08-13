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

function sourceMatchesPost(source: SignalSource, post: SignalPost) {
  const sourceUrl = normalized(source.linkedinUrl)
  const postUrl = normalized(post.authorUrl)

  if (sourceUrl && postUrl && sourceUrl === postUrl) return true

  const sourceName = normalized(source.name)
  const authorName = normalized(post.authorName)
  return Boolean(sourceName && authorName && sourceName === authorName)
}

export function getOverviewMetrics(
  posts: SignalPost[],
  sources: SignalSource[],
  comments: SignalComment[],
  companies: SignalCompany[],
): OverviewMetrics {
  const approvedPosts = posts.filter((post) => post.curationStatus === "aprovado")
  const monitoredSources = sources.filter((source) => source.status === "monitorada")
  const monitoredAuthors = new Set(
    approvedPosts
      .filter((post) => monitoredSources.some((source) => sourceMatchesPost(source, post)))
      .map((post) => post.authorUrl ?? post.authorName)
      .filter((author): author is string => Boolean(author)),
  )

  return {
    // During discovery, profiles are the first real result. Posts only exist
    // after an approved source is monitored, so do not present a false zero
    // while Brazilian candidates are already available for review.
    initialResults: posts.length > 0 ? posts.length : sources.length,
    approvedPosts: approvedPosts.length,
    monitoredAuthors: monitoredAuthors.size,
    analyzedComments: comments.filter((comment) => Boolean(comment.tone)).length,
    identifiedCompanies: companies.length,
  }
}

export function getUsefulComments(comments: SignalComment[], limit = 4) {
  return comments
    .filter((comment) => Boolean(comment.tone) && normalized(comment.tone) !== "generico")
    .slice(0, limit)
}

export function getTopCompanies(companies: SignalCompany[], limit = 5) {
  return [...companies]
    .sort((first, second) => second.comments - first.comments || second.people - first.people || first.name.localeCompare(second.name, "pt-BR"))
    .slice(0, limit)
}
