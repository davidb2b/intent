import { normalizeProfileSlug } from "./profile-identity.ts"

type ProfileResult = {
  linkedinUrl?: unknown
  location?: unknown
  country?: unknown
  countryCode?: unknown
  basic_info?: { location?: unknown }
}

export const MAX_PROFILES_PER_DISCOVERY = 25

/**
 * HarvestAPI receives profile URLs through `queries`. One bounded batch
 * prevents a discovery run from waiting for one network request per author.
 */
export function buildBrazilProfileBatchInput(profileUrls: string[]) {
  return {
    queries: profileUrls.slice(0, MAX_PROFILES_PER_DISCOVERY),
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

function normalized(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    : ""
}

/**
 * Accepts only explicit Brazilian origin from the profile provider. Free-form
 * profile text, language and company location are deliberately not used as
 * substitutes for a country code.
 */
export function isBrazilianProfile(profile: ProfileResult | undefined) {
  if (!profile) return false

  const values = [profile.location, profile.country, profile.countryCode, profile.basic_info?.location]
    .flatMap((value) => {
      if (typeof value === "string") return [normalized(value)]
      if (!value || typeof value !== "object") return []
      const item = value as Record<string, unknown>
      return [item.countryCode, item.country_code, item.country, item.full].map(normalized)
    })

  return values.some((value) =>
    value === "br" ||
    value === "brazil" ||
    value === "brasil" ||
    value.endsWith(", brazil") ||
    value.endsWith(", brasil"),
  )
}
