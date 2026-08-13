const MAX_LINKEDIN_QUERY_LENGTH = 85

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

/**
 * Post Search does not expose a country filter. We preserve the exact term
 * and add one Brazil-oriented variation, then accept a source only after its
 * profile location is verified as Brazilian. This widens English B2B terms
 * such as "cost breakdown" without ever accepting a foreign profile.
 */
export function buildBrazilFirstQueries(terms: string[]) {
  const queries = terms.flatMap((term) => {
    const base = term.trim()
    if (!base) return []
    const exact = base.length <= MAX_LINKEDIN_QUERY_LENGTH ? base : base.slice(0, MAX_LINKEDIN_QUERY_LENGTH)
    const brazil = `${exact} Brasil`.slice(0, MAX_LINKEDIN_QUERY_LENGTH)
    return [exact, brazil]
  })
  return [...new Set(queries.map((query) => query.trim()).filter(Boolean))]
}

/** Source discovery must never send company pages to the person-profile Actor. */
export function isLinkedInPersonProfileUrl(value: string | null | undefined) {
  if (!value) return false
  try {
    const url = new URL(value)
    return /(^|\.)linkedin\.com$/i.test(url.hostname) && /^\/in\/[^/]+/i.test(url.pathname)
  } catch {
    return false
  }
}

/**
 * Used only to choose which candidates enter a bounded verification batch.
 * It never accepts an author by itself.
 */
export function brazilRelevanceScore(content: string | null | undefined) {
  const value = normalized(content ?? "")
  const directSignals = ["brasil", "brazil", "sao paulo", "rio de janeiro", "belo horizonte", "curitiba", "porto alegre", "recife", "salvador", "brasilia"]
  return directSignals.reduce((score, signal) => score + (value.includes(signal) ? 1 : 0), 0)
}
