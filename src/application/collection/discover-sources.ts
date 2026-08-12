import { supabase } from "@/infrastructure/supabase/client"

export type DiscoverSourcesResult = {
  executionId: string
  status: "concluida"
  candidatesFound: number
  candidatesInserted: number
  candidatesRejected: number
  costUsd: number
}

export async function discoverSources(projectId: string, terms: string[], janela = "3months") {
  if (!projectId) throw new Error("Configure uma pesquisa antes de descobrir fontes.")
  const validTerms = terms.map((term) => term.trim()).filter(Boolean)
  if (validTerms.length === 0) throw new Error("Informe ao menos um termo para descobrir fontes.")
  const { data, error } = await supabase.functions.invoke<DiscoverSourcesResult>("discover-sources", { body: { projeto_id: projectId, termos: validTerms, janela } })
  if (error) {
    const context = "context" in error ? (error as { context?: Response }).context : undefined
    if (context) { try { const body = await context.clone().json() as { error?: string }; if (body.error) throw new Error(body.error) } catch (contextError) { if (contextError instanceof Error && contextError.message !== "Unexpected end of JSON input") throw contextError } }
    throw new Error(error.message || "Não foi possível descobrir fontes.")
  }
  if (!data) throw new Error("O backend não retornou o resultado da descoberta.")
  return data
}
