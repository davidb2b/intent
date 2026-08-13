import { supabase } from "@/infrastructure/supabase/client"
import { functionErrorMessage } from "@/lib/supabase-function-error"

export type AnalyzePostsResult = { status: "concluida"; analyzed: number; remaining: number }

export async function analyzePosts(projectId: string, target: "discovery" | "monitoring"): Promise<AnalyzePostsResult> {
  const { data, error } = await supabase.functions.invoke<AnalyzePostsResult>("analyze-posts", { body: { projectId, target } })
  if (error) {
    throw new Error(await functionErrorMessage(error, "Não foi possível analisar os posts."))
  }
  if (!data) throw new Error("O backend não retornou o resultado da análise.")
  return data
}
