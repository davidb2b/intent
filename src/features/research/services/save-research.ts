import { supabase } from "@/infrastructure/supabase/client"

export type SaveResearchInput = { ownerId: string; keyword: string; positiveContext: string; negativeContext: string }

export function shouldStartNewResearch(activeKeyword: string | null, nextKeyword: string, executionCount: number) {
  return activeKeyword?.trim().toLocaleLowerCase("pt-BR") !== nextKeyword.trim().toLocaleLowerCase("pt-BR") || executionCount > 0
}

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
  const { data: activeProject, error: activeProjectError } = await supabase.from("projetos").select("id, categoria, execucoes(id)").eq("owner_id", normalized.ownerId).eq("ativo", true).maybeSingle()
  if (activeProjectError) throw new Error(activeProjectError.message)
  const executionCount = activeProject?.execucoes?.length ?? 0
  const mustCreateResearch = !activeProject || shouldStartNewResearch(activeProject.categoria, keyword, executionCount)

  if (mustCreateResearch && activeProject) {
    const { error } = await supabase.from("projetos").update({ ativo: false }).eq("id", activeProject.id)
    if (error) throw new Error(error.message)
  }

  const projectResult = mustCreateResearch
    ? await supabase.from("projetos").insert({ owner_id: normalized.ownerId, nome: "Signal Lab", categoria: keyword, ativo: true }).select("id").single()
    : await supabase.from("projetos").update({ nome: "Signal Lab", categoria: keyword }).eq("id", activeProject!.id).select("id").single()
  const project = projectResult.data
  if (projectResult.error || !project) throw new Error(projectResult.error?.message ?? "Não foi possível salvar a pesquisa.")
  const { error: termError } = await supabase.from("termos").upsert({ projeto_id: project.id, termo: keyword, contexto_positivo: normalized.positiveContext || null, contexto_negativo: normalized.negativeContext || null, ativo: true }, { onConflict: "projeto_id,termo" })
  if (termError) throw new Error(termError.message)
  const { error: inactiveTermsError } = await supabase.from("termos").update({ ativo: false }).eq("projeto_id", project.id).neq("termo", keyword).eq("ativo", true)
  if (inactiveTermsError) throw new Error(inactiveTermsError.message)
  return { projectId: project.id, keyword, positiveContext: normalized.positiveContext || null, negativeContext: normalized.negativeContext || null }
}
