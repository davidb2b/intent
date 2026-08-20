import { describe, expect, it } from "vitest"

import { inferWatchlistKind } from "./load-signals"

describe("inferWatchlistKind", () => {
  it("preserves a watchlist type already stored by the engine", () => {
    expect(inferWatchlistKind("https://www.linkedin.com/in/pessoa", "pagina")).toBe("pagina")
  })

  it("recovers legacy people and company sources from their public LinkedIn URL", () => {
    expect(inferWatchlistKind("https://www.linkedin.com/in/pessoa-publica", null)).toBe("pessoa")
    expect(inferWatchlistKind("https://www.linkedin.com/company/empresa-publica", null)).toBe("pagina")
    expect(inferWatchlistKind("https://www.linkedin.com/school/escola-publica", null)).toBe("pagina")
  })

  it("does not invent a type when the public URL is not enough", () => {
    expect(inferWatchlistKind("https://www.linkedin.com/feed/update/urn:li:activity:1", null)).toBeNull()
    expect(inferWatchlistKind("url-invalida", null)).toBeNull()
  })
})
