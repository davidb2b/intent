import { supabase } from "@/infrastructure/supabase/client"
import { functionErrorMessage } from "@/lib/supabase-function-error"

export type DiscoverSourcesResult = {
  executionId: string
  status: "concluida"
  postsFound: number
  candidatesFound: number
  candidatesInserted: number
  candidatesRejected: number
  candidatesUnverified: number
  costUsd: number
  warnings: string[]
  outcome?: "sources_found" | "no_posts" | "no_brazilian_profiles"
  message?: string
}

export async function discoverSources(projectId: string, terms: string[], janela = "3months") {
  if (!projectId) throw new Error("Configure uma pesquisa antes de descobrir fontes.")
  const validTerms = terms.map((term) => term.trim()).filter(Boolean)
  if (validTerms.length === 0) throw new Error("Informe ao menos um termo para descobrir fontes.")
  const { data, error } = await supabase.functions.invoke<DiscoverSourcesResult>("discover-sources", { body: { projeto_id: projectId, termos: validTerms, janela } })
  if (error) {
    throw new Error(await functionErrorMessage(error, "Não foi possível descobrir fontes."))
  }
  if (!data) throw new Error("O backend não retornou o resultado da descoberta.")
  return data
}
