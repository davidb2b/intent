import { supabase } from "@/infrastructure/supabase/client"

export type SignalSummary = {
  projectId: string | null
  posts: number
  comments: number
  people: number
  companies: number
  lastExecutionAt: string | null
}

export type SignalPost = {
  id: string
  linkedinUrl: string
  authorName: string | null
  authorUrl: string | null
  text: string | null
  publishedAt: string | null
  reactions: number | null
  comments: number | null
  shares: number | null
  curationStatus: string
}

export type SignalComment = {
  id: string
  text: string
  publishedAt: string | null
  tone: string | null
  personName: string
  personHeadline: string | null
  personUrl: string
  postUrl: string
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

export async function loadSignalPosts(projectId: string): Promise<SignalPost[]> {
  const { data, error } = await supabase
    .from("posts")
    .select("id, linkedin_url, autor_nome, autor_url, texto, publicado_em, total_reacoes, total_comentarios, total_shares, status_curadoria")
    .eq("projeto_id", projectId)
    .order("coletado_em", { ascending: false })
    .limit(50)

  if (error) throw new Error(error.message)
  return (data ?? []).map((post) => ({
    id: post.id,
    linkedinUrl: post.linkedin_url,
    authorName: post.autor_nome,
    authorUrl: post.autor_url,
    text: post.texto,
    publishedAt: post.publicado_em,
    reactions: post.total_reacoes,
    comments: post.total_comentarios,
    shares: post.total_shares,
    curationStatus: post.status_curadoria,
  }))
}

export async function loadSignalComments(projectId: string): Promise<SignalComment[]> {
  const { data, error } = await supabase
    .from("comentarios")
    .select("id, texto, publicado_em, teor, pessoa:pessoas!inner(nome, headline, linkedin_url), post:posts!inner(linkedin_url)")
    .eq("projeto_id", projectId)
    .order("coletado_em", { ascending: false })
    .limit(100)

  if (error) throw new Error(error.message)
  return (data ?? []).map((comment) => {
    const person = Array.isArray(comment.pessoa) ? comment.pessoa[0] : comment.pessoa
    const post = Array.isArray(comment.post) ? comment.post[0] : comment.post
    return {
      id: comment.id,
      text: comment.texto,
      publishedAt: comment.publicado_em,
      tone: comment.teor,
      personName: person.nome,
      personHeadline: person.headline,
      personUrl: person.linkedin_url,
      postUrl: post.linkedin_url,
    }
  })
}
