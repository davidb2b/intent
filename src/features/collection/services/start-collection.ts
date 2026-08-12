import { supabase } from "@/infrastructure/supabase/client"

export type StartCollectionInput = {
  keyword: string
  positiveContext?: string
  negativeContext?: string
}

export type StartCollectionResult = {
  executionId: string
  status: "concluida" | "rodando"
  postsRead: number
  commentsRead: number
  costUsd: number
}

export async function startCollection(input: StartCollectionInput): Promise<StartCollectionResult> {
  const keyword = input.keyword.trim()
  if (!keyword) throw new Error("Informe uma palavra-chave antes de iniciar a coleta.")

  const { data, error } = await supabase.functions.invoke<StartCollectionResult>("start-collection", {
    body: {
      keyword,
      positiveContext: input.positiveContext?.trim() || undefined,
      negativeContext: input.negativeContext?.trim() || undefined,
    },
  })

  if (error) {
    const context = "context" in error ? (error as { context?: Response }).context : undefined
    if (context) { try { const body = await context.clone().json() as { error?: string }; if (body.error) throw new Error(body.error) } catch (contextError) { if (contextError instanceof Error && contextError.message !== "Unexpected end of JSON input") throw contextError } }
    throw new Error(error.message || "Não foi possível iniciar a coleta.")
  }
  if (!data) throw new Error("O backend não retornou o estado da coleta.")
  return data
}
