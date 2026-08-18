import { supabase } from "@/infrastructure/supabase/client"
import { functionErrorMessage } from "@/lib/supabase-function-error"
import type { IcpRecord, IntentProject, OnboardingExecution, OnboardingWorkspace } from "../domain/onboarding"

type ProjectRow = {
  id: string
  nome: string
  site_url: string | null
  site_dominio: string | null
  onboarding_status: IntentProject["onboardingStatus"]
  onboarding_aviso: string | null
  creditos_mensais: number
}

type IcpRow = {
  id: string
  projeto_id: string
  versao: number
  status: IcpRecord["status"]
  empresa_resumo: string
  firmografia: IcpRecord["company"]
  comprador: IcpRecord["buyer"]
  sinais_de_compra: IcpRecord["buyingSignals"]
  custo_usd: number | string
  criado_em: string
  ativado_em: string | null
}

function mapProject(row: ProjectRow): IntentProject {
  return { id: row.id, name: row.nome, siteUrl: row.site_url, domain: row.site_dominio, onboardingStatus: row.onboarding_status, onboardingWarning: row.onboarding_aviso, monthlyCredits: row.creditos_mensais }
}

function mapIcp(row: IcpRow): IcpRecord {
  return {
    id: row.id,
    projectId: row.projeto_id,
    version: row.versao,
    status: row.status,
    companySummary: row.empresa_resumo,
    company: row.firmografia,
    buyer: row.comprador,
    buyingSignals: row.sinais_de_compra,
    costUsd: Number(row.custo_usd ?? 0),
    createdAt: row.criado_em,
    activatedAt: row.ativado_em,
  }
}

export async function prepareIntentProject(userId: string): Promise<IntentProject> {
  const columns = "id,nome,site_url,site_dominio,onboarding_status,onboarding_aviso,creditos_mensais"
  const existing = await supabase.from("projetos").select(columns).eq("owner_id", userId).maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  if (existing.data) return mapProject(existing.data as ProjectRow)

  const created = await supabase.from("projetos").insert({ owner_id: userId, nome: "Intent", categoria: "Intent" }).select(columns).single()
  if (created.error) throw new Error(created.error.message)
  return mapProject(created.data as ProjectRow)
}

export async function loadOnboardingWorkspace(userId: string): Promise<OnboardingWorkspace> {
  const project = await prepareIntentProject(userId)
  const [icpsResult, executionResult] = await Promise.all([
    supabase.from("icps").select("id,projeto_id,versao,status,empresa_resumo,firmografia,comprador,sinais_de_compra,custo_usd,criado_em,ativado_em").eq("projeto_id", project.id).order("versao", { ascending: false }),
    supabase.from("execucoes").select("id,status,etapa_atual,progresso,mensagem_progresso,erro,custo_usd").eq("projeto_id", project.id).eq("tipo", "onboarding").order("iniciada_em", { ascending: false }).limit(1).maybeSingle(),
  ])
  if (icpsResult.error) throw new Error(icpsResult.error.message)
  if (executionResult.error) throw new Error(executionResult.error.message)
  const icps = (icpsResult.data as IcpRow[] | null)?.map(mapIcp) ?? []
  const executionRow = executionResult.data as Record<string, unknown> | null
  const execution: OnboardingExecution | null = executionRow ? {
    id: String(executionRow.id),
    status: executionRow.status as OnboardingExecution["status"],
    stage: String(executionRow.etapa_atual ?? "site") as OnboardingExecution["stage"],
    progress: Number(executionRow.progresso ?? 0),
    message: String(executionRow.mensagem_progresso ?? "Preparando a análise."),
    error: typeof executionRow.erro === "string" ? executionRow.erro : null,
    costUsd: Number(executionRow.custo_usd ?? 0),
  } : null
  return { project, latestIcp: icps[0] ?? null, activeIcp: icps.find((item) => item.status === "ativo") ?? null, execution }
}

export async function loadOnboardingExecution(projectId: string): Promise<OnboardingExecution | null> {
  const result = await supabase.from("execucoes").select("id,status,etapa_atual,progresso,mensagem_progresso,erro,custo_usd").eq("projeto_id", projectId).eq("tipo", "onboarding").order("iniciada_em", { ascending: false }).limit(1).maybeSingle()
  if (result.error) throw new Error(result.error.message)
  const row = result.data as Record<string, unknown> | null
  return row ? {
    id: String(row.id), status: row.status as OnboardingExecution["status"], stage: String(row.etapa_atual ?? "site") as OnboardingExecution["stage"], progress: Number(row.progresso ?? 0), message: String(row.mensagem_progresso ?? "Preparando a análise."), error: typeof row.erro === "string" ? row.erro : null, costUsd: Number(row.custo_usd ?? 0),
  } : null
}

export async function generateIcp(projectId: string, siteUrl: string, regenerate = false) {
  const response = await supabase.functions.invoke("generate-icp", { body: { projectId, siteUrl, regenerate } })
  if (response.error) throw new Error(await functionErrorMessage(response.error, "Não foi possível analisar o site. Tente novamente."))
  return response.data as { icpId: string; version: number; warnings: string[]; costUsd: number }
}

export async function saveIcp(icp: IcpRecord) {
  const response = await supabase.functions.invoke("update-icp", { body: { icpId: icp.id, companySummary: icp.companySummary, solvedPains: icp.company.dores_resolvidas, buyer: icp.buyer, buyingSignals: icp.buyingSignals } })
  if (response.error) throw new Error(await functionErrorMessage(response.error, "Não foi possível salvar as alterações do ICP."))
}

export async function activateIcp(icpId: string) {
  const response = await supabase.functions.invoke("activate-icp", { body: { icpId } })
  if (response.error) throw new Error(await functionErrorMessage(response.error, "Não foi possível ativar o ICP."))
  return response.data as { version: number; queued: boolean }
}
