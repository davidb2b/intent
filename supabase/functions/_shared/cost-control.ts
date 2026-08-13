import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

export const DEFAULT_EXECUTION_LIMIT_USD = 15
export const MONTHLY_LIMIT_USD = 300
const UNIT_COST_USD = 0.0015

export class CostLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CostLimitError"
  }
}

function monthStart() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

export function estimateActorCost(actorId: string, input: Record<string, unknown>) {
  if (actorId === "harvestapi/linkedin-post-search") {
    const queryCount = Array.isArray(input.searchQueries) ? Math.max(input.searchQueries.length, 1) : 1
    return numeric(input.maxPosts) * queryCount * UNIT_COST_USD
  }
  if (actorId === "harvestapi/linkedin-post-comments") return numeric(input.maxItems) * UNIT_COST_USD * 2
  if (actorId === "harvestapi/linkedin-profile-search") return numeric(input.maxItems) * UNIT_COST_USD
  if (actorId === "harvestapi/linkedin-profile-posts") return numeric(input.maxPosts) * UNIT_COST_USD
  if (actorId === "harvestapi/linkedin-profile-scraper") {
    const profileCount = Array.isArray(input.queries) ? input.queries.length : 1
    // The selected profile-details plan is priced at US$ 4 per 1k profiles.
    return profileCount * 0.004
  }
  if (actorId === "apimaestro/linkedin-profile-detail") return UNIT_COST_USD
  return 0
}

export async function createCostBudget(admin: SupabaseClient, projectId: string, executionId: string, requestedLimit?: number) {
  const executionLimit = requestedLimit && requestedLimit > 0 ? Math.min(requestedLimit, MONTHLY_LIMIT_USD) : DEFAULT_EXECUTION_LIMIT_USD
  const { data, error } = await admin.from("execucoes").select("custo_usd").eq("projeto_id", projectId).gte("iniciada_em", monthStart())
  if (error) throw new Error(`Não foi possível verificar o teto mensal: ${error.message}`)
  const monthlySpent = (data ?? []).reduce((total, row) => total + numeric(row.custo_usd), 0)
  if (monthlySpent >= MONTHLY_LIMIT_USD) {
    await admin.from("execucoes").update({ status: "abortada_por_custo", erro: `Teto mensal de US$ ${MONTHLY_LIMIT_USD.toFixed(2)} atingido.`, concluida_em: new Date().toISOString() }).eq("id", executionId)
    throw new CostLimitError(`Teto mensal de US$ ${MONTHLY_LIMIT_USD.toFixed(2)} atingido. A execução não foi iniciada.`)
  }
  return { executionId, executionLimit, monthlyAvailable: MONTHLY_LIMIT_USD - monthlySpent, spent: 0 }
}

export function assertCallWithinBudget(budget: { executionLimit: number; monthlyAvailable: number; spent: number }, actorId: string, input: Record<string, unknown>) {
  const estimate = estimateActorCost(actorId, input)
  if (budget.spent + estimate > budget.executionLimit) throw new CostLimitError(`Teto por execução de US$ ${budget.executionLimit.toFixed(2)} atingido antes do Actor ${actorId}.`)
  if (budget.spent + estimate > budget.monthlyAvailable) throw new CostLimitError("O custo estimado da próxima chamada ultrapassa o saldo mensal disponível.")
  return estimate
}

export function registerActualCost(budget: { spent: number }, costUsd: number) {
  budget.spent += numeric(costUsd)
}
