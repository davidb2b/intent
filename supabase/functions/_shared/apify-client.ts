import { hasApifyItemLimit } from "./apify-result.ts"

export type ApifyRunResult = {
  actor: string
  costUsd: number
  durationMs: number
  items: unknown[]
  runId: string
}

export async function runApifyActor(
  actor: string,
  input: Record<string, unknown>,
  token: string,
  waitSeconds = 120,
): Promise<ApifyRunResult> {
  const startedAt = Date.now()
  const response = await fetch(
    `https://api.apify.com/v2/acts/${actor.replace("/", "~")}/runs?waitForFinish=${waitSeconds}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout((waitSeconds + 15) * 1_000),
    },
  )

  if (!response.ok) throw new Error(`O Actor ${actor} não iniciou (${response.status}).`)
  const run = await response.json()
  const runId = String(run.data?.id ?? "")
  if (run.data?.status !== "SUCCEEDED") {
    throw new Error(`O Actor ${actor} terminou com status ${run.data?.status ?? "desconhecido"}.`)
  }

  const datasetId = run.data?.defaultDatasetId
  if (!datasetId) throw new Error(`O Actor ${actor} não retornou dataset.`)
  const dataset = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) },
  )
  if (!dataset.ok) throw new Error(`Não foi possível ler o resultado do Actor ${actor}.`)
  const rawItems = await dataset.json()
  const items = Array.isArray(rawItems) ? rawItems : []
  if (hasApifyItemLimit(items)) throw new Error(`O Actor ${actor} atingiu o limite de itens da conta.`)

  return {
    actor,
    costUsd: Number(run.data?.usageTotalUsd ?? 0),
    durationMs: Date.now() - startedAt,
    items,
    runId,
  }
}
