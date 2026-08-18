import { supabase } from "@/infrastructure/supabase/client"
import { functionErrorMessage } from "@/lib/supabase-function-error"

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
    throw new Error(await functionErrorMessage(error, "Não foi possível iniciar a coleta."))
  }
  if (!data) throw new Error("Não recebemos a confirmação do início da atualização. Tente novamente.")
  return data
}
