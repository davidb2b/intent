export const AUTHOR_WATCHLIST_MIN_ICP_ENGAGERS = 3

export function qualifiesAuthorForWatchlist(personIds: string[]) {
  return new Set(personIds.filter(Boolean)).size >= AUTHOR_WATCHLIST_MIN_ICP_ENGAGERS
}
