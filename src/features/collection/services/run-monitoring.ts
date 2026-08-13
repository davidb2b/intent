import { supabase } from "@/infrastructure/supabase/client"
import { functionErrorMessage } from "@/lib/supabase-function-error"

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
    throw new Error(await functionErrorMessage(error, "Não foi possível iniciar o monitoramento."))
  }
  if (!data) throw new Error("O backend não retornou o resultado do monitoramento.")
  return data
}
