import { describe, expect, it } from "vitest"
import { STALE_EXECUTION_AFTER_MS, isStaleExecution } from "./execution-lock"

describe("isStaleExecution", () => {
  const now = Date.parse("2026-08-13T18:00:00.000Z")

  it("keeps a recent execution locked", () => {
    expect(isStaleExecution("2026-08-13T17:58:00.001Z", now)).toBe(false)
  })

  it("releases an execution that exceeded the recovery window", () => {
    expect(isStaleExecution(new Date(now - STALE_EXECUTION_AFTER_MS).toISOString(), now)).toBe(true)
  })

  it("does not treat a missing or malformed date as stale", () => {
    expect(isStaleExecution(null, now)).toBe(false)
    expect(isStaleExecution("not-a-date", now)).toBe(false)
  })
})
