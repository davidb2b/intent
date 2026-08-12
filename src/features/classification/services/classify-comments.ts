import { supabase } from "@/infrastructure/supabase/client"

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
    const context = "context" in error ? (error as { context?: Response }).context : undefined
    if (context) { try { const body = await context.clone().json() as { error?: string }; if (body.error) throw new Error(body.error) } catch (contextError) { if (contextError instanceof Error && contextError.message !== "Unexpected end of JSON input") throw contextError } }
    throw new Error(error.message || "Não foi possível classificar os comentários.")
  }
  if (!data) throw new Error("O backend não retornou o resultado da classificação.")
  return data
}
