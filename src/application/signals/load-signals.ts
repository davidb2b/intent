import { supabase } from "@/infrastructure/supabase/client"

export type SignalSummary = {
  projectId: string | null
  posts: number
  comments: number
  people: number
  companies: number
  lastExecutionAt: string | null
}

const emptySummary: SignalSummary = {
  projectId: null,
  posts: 0,
  comments: 0,
  people: 0,
  companies: 0,
  lastExecutionAt: null,
}

export async function loadSignalSummary(userId: string): Promise<SignalSummary> {
  const { data: project, error: projectError } = await supabase
    .from("projetos")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle()

  if (projectError) throw new Error(projectError.message)
  if (!project) return emptySummary

  const projectId = project.id
  const [posts, comments, people, companies, execution] = await Promise.all([
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("projeto_id", projectId),
    supabase.from("comentarios").select("id", { count: "exact", head: true }).eq("projeto_id", projectId),
    supabase.from("pessoas").select("id", { count: "exact", head: true }).eq("projeto_id", projectId),
    supabase.from("empresas").select("id", { count: "exact", head: true }).eq("projeto_id", projectId),
    supabase.from("execucoes").select("concluida_em, iniciada_em").eq("projeto_id", projectId).order("iniciada_em", { ascending: false }).limit(1).maybeSingle(),
  ])

  const firstError = [posts, comments, people, companies, execution].find((result) => result.error)?.error
  if (firstError) throw new Error(firstError.message)

  return {
    projectId,
    posts: posts.count ?? 0,
    comments: comments.count ?? 0,
    people: people.count ?? 0,
    companies: companies.count ?? 0,
    lastExecutionAt: execution.data?.concluida_em ?? execution.data?.iniciada_em ?? null,
  }
}
