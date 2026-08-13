export const STALE_EXECUTION_AFTER_MS = 3 * 60 * 1000

export function isStaleExecution(startedAt: string | null | undefined, now = Date.now()) {
  if (!startedAt) return false
  const startedAtMs = new Date(startedAt).getTime()
  return Number.isFinite(startedAtMs) && now - startedAtMs >= STALE_EXECUTION_AFTER_MS
}
