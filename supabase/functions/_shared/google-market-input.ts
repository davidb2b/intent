export function buildGoogleMarketInput(label: string) {
  return {
    queries: `"${label}" site:linkedin.com/company\n${label} concorrentes Brasil`,
    maxPagesPerQuery: 1,
    resultsPerPage: 10,
    countryCode: "br",
    searchLanguage: "pt",
    languageCode: "pt-BR",
    proxyConfiguration: { useApifyProxy: true },
  }
}
