import { describe, expect, it } from "vitest"

import { buildGoogleMarketInput } from "../../../../supabase/functions/_shared/google-market-input"

describe("Google market Actor input", () => {
  it("uses the official Brazilian Portuguese contract", () => {
    expect(buildGoogleMarketInput("5by5")).toEqual({
      queries: '"5by5" site:linkedin.com/company\n5by5 concorrentes Brasil',
      maxPagesPerQuery: 1,
      resultsPerPage: 10,
      countryCode: "br",
      searchLanguage: "pt",
      languageCode: "pt-BR",
      proxyConfiguration: { useApifyProxy: true },
    })
  })
})
