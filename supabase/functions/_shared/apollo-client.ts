export class ApolloRequestError extends Error {
  readonly retryAfterSeconds: number | null

  constructor(message: string, retryAfterSeconds: number | null = null) {
    super(message)
    this.name = "ApolloRequestError"
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export type ApolloResponse = {
  payload: Record<string, unknown>
  durationMs: number
  requestId: string | null
}

function retryAfterSeconds(response: Response) {
  const raw = response.headers.get("retry-after")
  if (!raw) return null
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : null
}

async function readApolloResponse(response: Response, startedAt: number): Promise<ApolloResponse> {
  if (!response.ok) {
    const retry = retryAfterSeconds(response)
    if (response.status === 429) {
      throw new ApolloRequestError("A pesquisa atingiu o limite temporário do provedor.", retry ?? 60)
    }
    if (response.status === 401 || response.status === 403) {
      throw new ApolloRequestError("A pesquisa não está disponível para esta conta.")
    }
    throw new ApolloRequestError(`O provedor não respondeu corretamente (${response.status}).`, retry)
  }

  const payload = await response.json().catch(() => null)
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ApolloRequestError("A pesquisa retornou um formato inválido.")
  }

  return {
    payload: payload as Record<string, unknown>,
    durationMs: Date.now() - startedAt,
    requestId: response.headers.get("x-request-id"),
  }
}

async function postApollo(
  path: string,
  input: Record<string, unknown>,
  apiKey: string,
): Promise<ApolloResponse> {
  const startedAt = Date.now()
  const response = await fetch(`https://api.apollo.io${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30_000),
  })

  return readApolloResponse(response, startedAt)
}

async function getApollo(path: string, apiKey: string): Promise<ApolloResponse> {
  const startedAt = Date.now()
  const response = await fetch(`https://api.apollo.io${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": apiKey,
    },
    signal: AbortSignal.timeout(30_000),
  })

  return readApolloResponse(response, startedAt)
}

export function enrichApolloOrganization(domain: string, apiKey: string): Promise<ApolloResponse> {
  const query = new URLSearchParams({ domain: domain.replace(/^www\./i, "").trim().toLowerCase() })
  return getApollo(`/api/v1/organizations/enrich?${query.toString()}`, apiKey)
}

export function searchApolloPeople(
  input: Record<string, unknown>,
  apiKey: string,
): Promise<ApolloResponse> {
  return postApollo("/api/v1/mixed_people/api_search", input, apiKey)
}

export function enrichApolloPerson(
  apolloPersonId: string,
  apiKey: string,
): Promise<ApolloResponse> {
  return postApollo("/api/v1/people/match", {
    id: apolloPersonId,
    reveal_personal_emails: false,
    reveal_phone_number: false,
    run_waterfall_email: false,
    run_waterfall_phone: false,
  }, apiKey)
}

export function enrichApolloPersonByLinkedinUrl(
  linkedinUrl: string,
  apiKey: string,
): Promise<ApolloResponse> {
  return postApollo("/api/v1/people/match", {
    linkedin_url: linkedinUrl,
    reveal_personal_emails: false,
    reveal_phone_number: false,
    run_waterfall_email: false,
    run_waterfall_phone: false,
  }, apiKey)
}

export function revealApolloContact(
  apolloPersonId: string,
  type: "email" | "telefone",
  apiKey: string,
): Promise<ApolloResponse> {
  return postApollo("/api/v1/people/match", {
    id: apolloPersonId,
    reveal_personal_emails: type === "email",
    reveal_phone_number: type === "telefone",
    run_waterfall_email: false,
    run_waterfall_phone: false,
  }, apiKey)
}
