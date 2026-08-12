import { supabase } from "@/infrastructure/supabase/client"

export type AnalyzePostsResult = { status: "concluida"; analyzed: number; remaining: number }

export async function analyzePosts(projectId: string): Promise<AnalyzePostsResult> {
  const { data, error } = await supabase.functions.invoke<AnalyzePostsResult>("analyze-posts", { body: { projectId } })
  if (error) {
    const context = "context" in error ? (error as { context?: Response }).context : undefined
    if (context) { try { const body = await context.clone().json() as { error?: string }; if (body.error) throw new Error(body.error) } catch (contextError) { if (contextError instanceof Error && contextError.message !== "Unexpected end of JSON input") throw contextError } }
    throw new Error(error.message || "Não foi possível analisar os posts.")
  }
  if (!data) throw new Error("O backend não retornou o resultado da análise.")
  return data
}
