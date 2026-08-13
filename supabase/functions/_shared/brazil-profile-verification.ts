import { normalizeProfileSlug } from "./profile-identity.ts"

type ProfileResult = {
  linkedinUrl?: unknown
}

export const MAX_PROFILES_PER_DISCOVERY = 25

/**
 * HarvestAPI accepts profile URLs in bulk. One bounded batch prevents a
 * discovery run from waiting for one network request per post author.
 */
export function buildBrazilProfileBatchInput(profileUrls: string[]) {
  return {
    urls: profileUrls.slice(0, MAX_PROFILES_PER_DISCOVERY),
    profileScraperMode: "Profile details no email ($4 per 1k)",
  }
}

/**
 * A profile returned by the Actor is only eligible when it maps back to an
 * author that originated in the post search. This protects against provider
 * substitutions and prevents unrelated Brazilian profiles from entering V1.
 */
export function requestedProfileSlugs(profileUrls: string[], items: ProfileResult[]) {
  const requested = new Set(profileUrls.map(normalizeProfileSlug))
  return new Set(items.flatMap((item) => {
    if (typeof item.linkedinUrl !== "string") return []
    const slug = normalizeProfileSlug(item.linkedinUrl)
    return requested.has(slug) ? [slug] : []
  }))
}
