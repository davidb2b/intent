import { supabase } from "@/infrastructure/supabase/client"

export type SaveResearchInput = { ownerId: string; keyword: string; positiveContext: string; negativeContext: string }

export function normalizeResearchInput(input: SaveResearchInput) {
  return {
    ownerId: input.ownerId,
    keyword: input.keyword.trim(),
    positiveContext: input.positiveContext.trim(),
    negativeContext: input.negativeContext.trim(),
  }
}

export async function saveResearch(input: SaveResearchInput) {
  const normalized = normalizeResearchInput(input)
  const keyword = normalized.keyword
  if (!keyword) throw new Error("Informe uma palavra-chave.")
  const { data: project, error: projectError } = await supabase.from("projetos").upsert({ owner_id: normalized.ownerId, nome: "Signal Lab", categoria: keyword }, { onConflict: "owner_id" }).select("id").single()
  if (projectError || !project) throw new Error(projectError?.message ?? "Não foi possível salvar o projeto.")
  const { error: termError } = await supabase.from("termos").upsert({ projeto_id: project.id, termo: keyword, contexto_positivo: normalized.positiveContext || null, contexto_negativo: normalized.negativeContext || null, ativo: true }, { onConflict: "projeto_id,termo" })
  if (termError) throw new Error(termError.message)
  return { projectId: project.id, keyword, positiveContext: normalized.positiveContext || null, negativeContext: normalized.negativeContext || null }
}
