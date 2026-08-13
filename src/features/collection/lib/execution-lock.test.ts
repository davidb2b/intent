import { describe, expect, it } from "vitest"

import { STALE_EXECUTION_AFTER_MS, isStaleExecution } from "../../../../supabase/functions/_shared/execution-lock"

describe("execution lock recovery", () => {
  it("keeps recent collections locked and releases only interrupted executions", () => {
    const now = Date.UTC(2026, 7, 13, 16, 0, 0)
    expect(isStaleExecution(new Date(now - STALE_EXECUTION_AFTER_MS + 1).toISOString(), now)).toBe(false)
    expect(isStaleExecution(new Date(now - STALE_EXECUTION_AFTER_MS).toISOString(), now)).toBe(true)
  })
})
