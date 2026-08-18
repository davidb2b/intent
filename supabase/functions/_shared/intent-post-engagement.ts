import { canonicalProfileUrl, normalizeProfileSlug } from "./profile-identity.ts"
import { usablePersonName } from "./person-enrichment.ts"

type RecordValue = Record<string, unknown>

export type NormalizedPostEngagement = {
  type: "comment" | "reaction"
  externalId: string
  profileUrl: string
  profileSlug: string
  personName: string
  headline: string | null
  evidence: string | null
  occurredAt: string | null
  reactionType: string | null
}

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.replace(/\s+/g, " ").trim()
  }
  return null
}

function isoDate(...values: unknown[]) {
  for (const value of values) {
    const candidate = typeof value === "number"
      ? new Date(value)
      : typeof value === "string" && value.trim()
        ? new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value.trim()) ? `${value.trim().replace(" ", "T")}Z` : value)
        : null
    if (candidate && Number.isFinite(candidate.getTime())) return candidate.toISOString()
  }
  return null
}

function profileIdentity(value: unknown) {
  const url = text(value)
  if (!url || !/^https?:\/\/(?:(?:www|[a-z]{2})\.)?linkedin\.com\/in\//i.test(url)) return null
  const profileUrl = canonicalProfileUrl(url)
  const profileSlug = normalizeProfileSlug(profileUrl)
  return profileSlug ? { profileUrl, profileSlug } : null
}

export function normalizePostEngagementItem(value: unknown, expectedType: "comment" | "reaction"): NormalizedPostEngagement | null {
  const item = record(value)
  if (!item) return null
  if (text(item.sourceType, item.type) === "error") return null

  const actor = record(item.actor)
  const author = record(item.author)
  const reactor = record(item.reactor)
  const person = actor ?? author ?? reactor
  if (!person) return null

  const identity = profileIdentity(text(person.linkedinUrl, person.profile_url, person.profileUrl))
  const personName = usablePersonName(text(person.name, person.full_name))
  if (!identity || !personName) return null

  if (expectedType === "comment") {
    const commentType = text(item.comment_type)
    if (commentType && commentType !== "comment") return null
    const postedAt = record(item.posted_at)
    const evidence = text(item.commentary, item.text, item.comment_text)
    const occurredAt = isoDate(item.createdAt, item.created_at, item.createdAtTimestamp, postedAt?.timestamp, postedAt?.date)
    const externalId = text(item.id, item.comment_id)
    if (!externalId || !evidence || !occurredAt) return null
    return {
      type: "comment",
      externalId,
      ...identity,
      personName,
      headline: text(person.headline, person.position),
      evidence,
      occurredAt,
      reactionType: null,
    }
  }

  const reactionType = text(item.reactionType, item.reaction_type, item.type) ?? "REACTION"
  const externalId = text(item.id, item.reaction_id, person.urn)
  if (!externalId) return null
  return {
    type: "reaction",
    externalId: `${externalId}:${reactionType}`,
    ...identity,
    personName,
    headline: text(person.headline, person.position),
    evidence: null,
    occurredAt: null,
    reactionType,
  }
}

export function dedupePostEngagements(items: NormalizedPostEngagement[]) {
  const unique = new Map<string, NormalizedPostEngagement>()
  for (const item of items) unique.set(`${item.type}:${item.externalId}`, item)
  return [...unique.values()]
}

export function postEngagementPersonSlugs(items: NormalizedPostEngagement[]) {
  return [...new Set(items.map((item) => item.profileSlug))]
}
