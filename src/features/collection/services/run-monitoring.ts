import { supabase } from "@/infrastructure/supabase/client"

export type RunMonitoringResult = {
  executionId: string
  status: "concluida"
  postsRead: number
  commentsRead: number
  peopleNew: number
  costUsd: number
}

export async function runMonitoring(projectId: string, janela = "month") {
  if (!projectId) throw new Error("Configure uma pesquisa antes de iniciar o monitoramento.")
  const { data, error } = await supabase.functions.invoke<RunMonitoringResult>("run-monitoring", { body: { projeto_id: projectId, janela, origem: "manual" } })
  if (error) {
    const context = "context" in error ? (error as { context?: Response }).context : undefined
    if (context) { try { const body = await context.clone().json() as { error?: string }; if (body.error) throw new Error(body.error) } catch (contextError) { if (contextError instanceof Error && contextError.message !== "Unexpected end of JSON input") throw contextError } }
    throw new Error(error.message || "Não foi possível iniciar o monitoramento.")
  }
  if (!data) throw new Error("O backend não retornou o resultado do monitoramento.")
  return data
}
