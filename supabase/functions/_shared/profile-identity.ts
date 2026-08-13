export function normalizeProfileSlug(url: string) {
  const match = url.match(/\/in\/([^/?#]+)/i)
  const value = match?.[1] ?? url.split("/").filter(Boolean).pop() ?? ""
  return decodeURIComponent(value).toLowerCase().replace(/\/$/, "")
}

/**
 * Removes LinkedIn tracking parameters and makes each public profile use one
 * stable URL. This is used for persistence and Actor inputs, so the same
 * person cannot be discovered twice through `?trk` variants.
 */
export function canonicalProfileUrl(url: string) {
  try {
    const parsed = new URL(url)
    if (/(^|\.)linkedin\.com$/i.test(parsed.hostname) && /^\/in\/[^/]+/i.test(parsed.pathname)) {
      const slug = normalizeProfileSlug(url)
      return slug ? `https://www.linkedin.com/in/${encodeURIComponent(slug)}` : url
    }
  } catch {
    // The original value is retained below so callers can produce a useful
    // provider error rather than silently losing a configured source.
  }
  return url.replace(/[?#].*$/, "").replace(/\/$/, "")
}

export function profileUsername(url: string) {
  return normalizeProfileSlug(url)
}
