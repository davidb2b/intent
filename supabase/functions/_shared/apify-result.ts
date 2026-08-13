/**
 * Marketplace Actors can finish with a successful run while returning their
 * own quota message as a dataset item. Treat that as a provider failure so a
 * configured fallback gets a chance to run.
 */
export function hasApifyItemLimit(items: unknown[]) {
  return items.some((item) => {
    if (!item || typeof item !== "object" || typeof (item as Record<string, unknown>).message !== "string") return false
    const message = (item as { message: string }).message.toLowerCase()
    return message.includes("free-tier limit") || message.includes("free user item limit") || message.includes("item limit exceeded")
  })
}
