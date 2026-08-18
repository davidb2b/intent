import { supabase } from "@/infrastructure/supabase/client"
import { functionErrorMessage } from "@/lib/supabase-function-error"

export type ClassifyCommentsResult = {
  status: "concluida"
  classified: number
  remaining: number
}

export async function classifyComments(projectId: string): Promise<ClassifyCommentsResult> {
  if (!projectId) throw new Error("Nenhum projeto autenticado para classificar.")
  const { data, error } = await supabase.functions.invoke<ClassifyCommentsResult>("classify-comments", {
    body: { projectId },
  })
  if (error) {
    throw new Error(await functionErrorMessage(error, "Não foi possível classificar os comentários."))
  }
  if (!data) throw new Error("Não recebemos a confirmação da análise. Tente novamente.")
  return data
}
