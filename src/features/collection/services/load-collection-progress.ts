import { supabase } from "@/infrastructure/supabase/client"

export type CollectionProgress = {
  executionId: string
  stage: string
  progress: number
  message: string
}

export async function loadCollectionProgress(projectId: string): Promise<CollectionProgress | null> {
  const { data, error } = await supabase
    .from("execucoes")
    .select("id, etapa_atual, progresso, mensagem_progresso")
    .eq("projeto_id", projectId)
    .eq("status", "rodando")
    .order("iniciada_em", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  return {
    executionId: data.id,
    stage: data.etapa_atual,
    progress: data.progresso,
    message: data.mensagem_progresso ?? "Preparando a atualização.",
  }
}
