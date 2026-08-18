type RecordValue = Record<string, unknown>

export type NormalizedActivity = {
  type: "comment" | "reaction"
  externalId: string
  evidence: string
  context: string | null
  postUrl: string
  postUrn: string
  occurredAt: string
  postAuthorName: string | null
  postAuthorUrl: string | null
}

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null
}

function text(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

function date(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      const parsed = new Date(value > 10_000_000_000 ? value : value * 1000)
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
    }
    if (typeof value !== "string" || !value.trim()) continue
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value.trim())
      ? `${value.trim().replace(" ", "T")}Z`
      : value.trim()
    const parsed = new Date(normalized)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return null
}

function postUrn(postUrl: string, explicit: string | null) {
  if (explicit) return explicit
  const activity = postUrl.match(/activity[:-](\d+)/i)?.[1]
  return activity ? `urn:li:activity:${activity}` : postUrl
}

function stableId(item: RecordValue, postUrl: string, evidence: string, occurredAt: string) {
  return text(item.id, item.urn, item.commentUrn, item.comment_urn, item.dedupeKey)
    ?? `${postUrl}|${occurredAt}|${evidence}`
}

export function normalizeProfileActivityItem(
  value: unknown,
  expectedType: "comment" | "reaction",
): NormalizedActivity | null {
  const item = record(value)
  if (!item || item.sourceType === "error" || item.type === "error") return null
  const post = record(item.post)
  const actor = record(item.actor)
  const author = record(item.author) ?? record(post?.author)
  const detected = text(item.sourceType, item.type, item.activityType, item.action)?.toLowerCase() ?? expectedType
  const type = detected.includes("comment") || detected.includes("coment") ? "comment" : detected.includes("react") || detected.includes("like") || detected.includes("curt") ? "reaction" : expectedType
  if (type !== expectedType) return null

  const postUrl = text(item.postUrl, item.post_url, item.linkedinUrl, item.url, post?.linkedinUrl, post?.url)
  const occurredAt = date(item.eventTimestamp, item.createdAt, item.eventDate, item.occurredAt, item.postedAt, post?.createdAt, post?.postedAt)
  const comment = text(item.commentary, item.commentText, item.comment_text, item.comment, item.text)
  const postText = text(item.postText, item.post_text, post?.text, post?.content, item.content)
  const action = text(item.action, item.reactionType, item.reaction)
  const evidence = type === "comment" ? comment : postText ?? action
  const context = type === "comment" ? postText : action

  if (!postUrl || !occurredAt || !evidence) return null
  if (!/^https?:\/\/(?:(?:www|[a-z]{2})\.)?linkedin\.com\//i.test(postUrl)) return null

  const explicitPostUrn = text(item.postId, item.postUrn, post?.id, post?.urn)
  return {
    type,
    externalId: stableId(item, postUrl, evidence, occurredAt),
    evidence,
    context,
    postUrl,
    postUrn: postUrn(postUrl, explicitPostUrn),
    occurredAt,
    postAuthorName: text(item.postAuthorName, item.post_author_name, author?.name, actor?.name),
    postAuthorUrl: text(item.postAuthorProfileUrl, item.post_author_profile_url, author?.linkedinUrl, actor?.linkedinUrl),
  }
}

export function dedupeActivities(items: NormalizedActivity[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.type}|${item.externalId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
