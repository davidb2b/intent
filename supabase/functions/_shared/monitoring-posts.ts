import { canonicalProfileUrl } from "./profile-identity.ts"

export const MONITORED_PROFILE_POSTS_ACTOR = "harvestapi/linkedin-profile-posts"
export const WATCHLIST_POST_LIMIT = 10

type JsonRecord = Record<string, unknown>

export type NormalizedWatchlistPost = {
  authorName: string
  authorUrl: string
  comments: number | null
  linkedinUrl: string
  postUrn: string
  publishedAt: string | null
  reactions: number | null
  shares: number | null
  text: string | null
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function count(value: unknown) {
  if (Array.isArray(value)) return value.length
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? Math.trunc(numeric) : null
}

function cleanLinkedInUrl(value: string) {
  return value.replace(/[?#].*$/, "").replace(/\/$/, "")
}

function postUrn(value: JsonRecord, linkedinUrl: string | null) {
  const candidates = [value.id, value.urn, value.postUrn, value.activityUrn]
  for (const candidate of candidates) {
    const literal = text(candidate)
    if (!literal) continue
    const urnMatch = literal.match(/urn:li:(?:activity|share|ugcPost):\d+/i)
    if (urnMatch) return urnMatch[0]
    if (/^\d{8,}$/.test(literal)) return `urn:li:activity:${literal}`
  }
  const urlMatch = linkedinUrl?.match(/urn:li:(?:activity|share|ugcPost):\d+/i)
    ?? linkedinUrl?.match(/activity-(\d{8,})/i)
  if (!urlMatch) return null
  return urlMatch[0].startsWith("urn:li:") ? urlMatch[0] : `urn:li:activity:${urlMatch[1]}`
}

function publishedAt(value: JsonRecord) {
  const postedAt = record(value.postedAt)
  const candidates = [
    postedAt?.date,
    postedAt?.timestamp,
    value.publishedAt,
    value.postedDate,
    value.createdAt,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      const date = new Date(candidate < 10_000_000_000 ? candidate * 1_000 : candidate)
      if (!Number.isNaN(date.getTime())) return date.toISOString()
    }
    const literal = text(candidate)
    if (!literal) continue
    if (/^\d{10,13}$/.test(literal)) {
      const numeric = Number(literal)
      const date = new Date(literal.length === 10 ? numeric * 1_000 : numeric)
      if (!Number.isNaN(date.getTime())) return date.toISOString()
    }
    const date = new Date(literal)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  return null
}

/**
 * Normalizes only stable, public post fields from the Actor contract. Missing
 * provider fields stay null; the engine never synthesizes text, dates or
 * engagement counts.
 */
export function normalizeWatchlistPost(
  value: unknown,
  source: { linkedinUrl: string; name: string },
): NormalizedWatchlistPost | null {
  const item = record(value)
  if (!item) return null
  const author = record(item.author) ?? record(item.actor)
  const engagement = record(item.engagement)
  const rawUrl = text(item.linkedinUrl) ?? text(item.url) ?? text(item.postUrl)
  const urn = postUrn(item, rawUrl)
  if (!urn) return null

  const linkedinUrl = rawUrl
    ? cleanLinkedInUrl(rawUrl)
    : `https://www.linkedin.com/feed/update/${urn}`
  const authorName = text(author?.name) ?? text(item.authorName) ?? text(source.name)
  const authorUrl = text(author?.linkedinUrl) ?? text(item.authorUrl) ?? text(source.linkedinUrl)
  if (!authorName || !authorUrl) return null

  return {
    authorName,
    authorUrl: canonicalProfileUrl(authorUrl),
    comments: count(engagement?.comments ?? item.commentsCount ?? item.numComments),
    linkedinUrl,
    postUrn: urn,
    publishedAt: publishedAt(item),
    reactions: count(engagement?.reactions ?? item.reactionsCount ?? item.numLikes),
    shares: count(engagement?.shares ?? item.sharesCount ?? item.numShares),
    text: text(item.text) ?? text(item.content) ?? text(item.commentary),
  }
}

/**
 * Contract for collecting posts from profiles that were explicitly approved
 * for monitoring. Post Search is reserved for broad discovery; Profile Posts
 * receives the known profile URLs through `targetUrls`.
 */
export function buildMonitoredProfilePostsInput(
  linkedinUrls: string[],
  janela: string,
  maxPosts = WATCHLIST_POST_LIMIT,
) {
  const targetUrls = [...new Set(linkedinUrls.map(canonicalProfileUrl).filter(Boolean))]
  return {
    targetUrls,
    maxPosts,
    postedLimit: janela,
    scrapeComments: false,
    scrapeReactions: false,
  }
}
