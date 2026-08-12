import { supabase } from "@/infrastructure/supabase/client"

export type SaveResearchInput = { ownerId: string; keyword: string; positiveContext: string; negativeContext: string }

export async function saveResearch(input: SaveResearchInput) {
  const keyword = input.keyword.trim()
  if (!keyword) throw new Error("Informe uma palavra-chave.")
  const { data: project, error: projectError } = await supabase.from("projetos").upsert({ owner_id: input.ownerId, nome: "Signal Lab", categoria: keyword }, { onConflict: "owner_id" }).select("id").single()
  if (projectError || !project) throw new Error(projectError?.message ?? "Não foi possível salvar o projeto.")
  const { error: termError } = await supabase.from("termos").upsert({ projeto_id: project.id, termo: keyword, contexto_positivo: input.positiveContext.trim() || null, contexto_negativo: input.negativeContext.trim() || null, ativo: true }, { onConflict: "projeto_id,termo" })
  if (termError) throw new Error(termError.message)
  return { projectId: project.id, keyword, positiveContext: input.positiveContext.trim() || null, negativeContext: input.negativeContext.trim() || null }
}
