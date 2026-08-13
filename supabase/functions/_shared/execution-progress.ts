import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

export type ExecutionProgress = {
  stage: string
  progress: number
  message: string
}

export async function persistExecutionProgress(client: SupabaseClient, executionId: string, value: ExecutionProgress) {
  const { error } = await client
    .from("execucoes")
    .update({ etapa_atual: value.stage, progresso: value.progress, mensagem_progresso: value.message })
    .eq("id", executionId)

  if (error) throw new Error(`Não foi possível atualizar o progresso da execução: ${error.message}`)
}
