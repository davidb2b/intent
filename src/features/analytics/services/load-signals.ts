import { supabase } from "@/infrastructure/supabase/client"
import { parseSourceMeta } from "../lib/source-meta"
import { calculateSignalPriority } from "@/features/intent/domain/signal-priority"

export type SignalSummary = {
  projectId: string | null
  posts: number
  comments: number
  people: number
  companies: number
  lastExecutionAt: string | null
  keyword: string | null
  positiveContext: string | null
  negativeContext: string | null
  lastExecutionOrigin: "manual" | "agendada" | null
  monthlyCostUsd: number
  estimatedNextCostUsd: number
  monitoredSources: number
  executionHistory: SignalExecution[]
}

export type SignalExecution = {
  id: string
  type: "descoberta" | "monitoramento"
  status: string
  origin: "manual" | "agendada" | null
  postsRead: number
  commentsRead: number
  peopleNew: number
  costUsd: number
  error: string | null
  warnings: string[]
  outcome: "sources_found" | "no_posts" | "no_brazilian_profiles" | null
  message: string | null
  stage: string
  progress: number
  progressMessage: string | null
  startedAt: string
  completedAt: string | null
}

export type SignalPost = {
  id: string
  linkedinUrl: string | null
  authorName: string | null
  authorUrl: string | null
  text: string | null
  publishedAt: string | null
  reactions: number | null
  comments: number | null
  shares: number | null
  curationStatus: string
  analysis: { topic: string | null; problem: string | null; reason: string | null; collection: string | null }
  origin: "monitoring" | "discovery"
}

export type SignalComment = {
  id: string
  personId: string
  text: string
  publishedAt: string | null
  tone: string | null
  personName: string
  personHeadline: string | null
  companyName: string | null
  personUrl: string
  postUrl: string
  confidence: number | null
}

export type SignalSource = {
  id: string
  linkedinUrl: string
  name: string | null
  status: "monitorada" | "candidata" | "descartada"
  posts: number
  comments: number
  reactions: number
  ratio: number
  people: number
  icp: number
  yield: number | null
  previewPost: string | null
  kind: "pessoa" | "pagina" | null
}

export type SignalCompany = {
  id: string
  name: string
  sector: string | null
  size: string | null
  linkedinUrl: string | null
  people: number
  comments: number
}

export type SignalPerson = {
  id: string
  name: string
  headline: string | null
  role: string | null
  linkedinUrl: string
  seniority: string | null
  icp: boolean | null
  icpReason: string | null
  companyName: string | null
  comments: number
  signalCount: number
  signalTypes: string[]
  priorityScore: number
  priorityBucket: "alta" | "acompanhar"
  priorityLabel: "Prioridade alta" | "Em acompanhamento"
  emailAvailable: boolean
  phoneAvailable: boolean
  intentScore: number | null
  intentStatus: string | null
  lastSignalAt: string | null
  createdAt: string | null
}

const emptySummary: SignalSummary = {
  projectId: null,
  posts: 0,
  comments: 0,
  people: 0,
  companies: 0,
  lastExecutionAt: null,
  keyword: null,
  positiveContext: null,
  negativeContext: null,
  lastExecutionOrigin: null,
  monthlyCostUsd: 0,
  estimatedNextCostUsd: 0,
  monitoredSources: 0,
  executionHistory: [],
}

export async function loadSignalSummary(userId: string): Promise<SignalSummary> {
  const { data: project, error: projectError } = await supabase
    .from("projetos")
    .select("id")
    .eq("owner_id", userId)
    .eq("ativo", true)
    .maybeSingle()

  if (projectError) throw new Error(projectError.message)
  if (!project) return emptySummary

  const projectId = project.id
  const [posts, comments, people, companies, executions, term, sources] = await Promise.all([
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("projeto_id", projectId),
    supabase.from("sinais").select("id", { count: "exact", head: true }).eq("projeto_id", projectId).eq("tipo", "comentou_tema"),
    supabase.from("pessoas").select("id", { count: "exact", head: true }).eq("projeto_id", projectId),
    supabase.from("empresas").select("id", { count: "exact", head: true }).eq("projeto_id", projectId),
    supabase.from("execucoes").select("id, tipo, status, parametros, posts_lidos, comentarios_lidos, pessoas_novas, custo_usd, erro, etapa_atual, progresso, mensagem_progresso, iniciada_em, concluida_em").eq("projeto_id", projectId).order("iniciada_em", { ascending: false }).limit(20),
    supabase.from("termos").select("termo, contexto_positivo, contexto_negativo").eq("projeto_id", projectId).eq("ativo", true).order("criado_em", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("fontes").select("id", { count: "exact", head: true }).eq("projeto_id", projectId).eq("status", "monitorada"),
  ])

  const firstError = [posts, comments, people, companies, executions, term, sources].find((result) => result.error)?.error
  if (firstError) throw new Error(firstError.message)

  const executionHistory = (executions.data ?? []).map((execution) => {
    const parameters = execution.parametros as {
      origem?: string
      avisos?: unknown
      resultado?: { outcome?: unknown; message?: unknown }
    } | null
    const warnings = Array.isArray(parameters?.avisos) ? parameters.avisos.filter((warning): warning is string => typeof warning === "string") : []
    const outcome = parameters?.resultado?.outcome
    const message = parameters?.resultado?.message
    return {
      id: execution.id,
      type: execution.tipo,
      status: execution.status,
      origin: parameters?.origem === "agendada" ? "agendada" : parameters?.origem === "manual" ? "manual" : null,
      postsRead: execution.posts_lidos ?? 0,
      commentsRead: execution.comentarios_lidos ?? 0,
      peopleNew: execution.pessoas_novas ?? 0,
      costUsd: Number(execution.custo_usd ?? 0),
      error: execution.erro,
      warnings,
      outcome: outcome === "sources_found" || outcome === "no_posts" || outcome === "no_brazilian_profiles" ? outcome : null,
      message: typeof message === "string" ? message : null,
      stage: execution.etapa_atual,
      progress: execution.progresso,
      progressMessage: execution.mensagem_progresso,
      startedAt: execution.iniciada_em,
      completedAt: execution.concluida_em,
    } satisfies SignalExecution
  })
  const monthlyStart = new Date()
  monthlyStart.setDate(1)
  monthlyStart.setHours(0, 0, 0, 0)
  const monthlyCostUsd = executionHistory.filter((execution) => new Date(execution.startedAt) >= monthlyStart).reduce((total, execution) => total + execution.costUsd, 0)
  const monitoredSources = sources.count ?? 0
  const estimatedPosts = monitoredSources * 8
  const estimatedComments = estimatedPosts * 40
  const estimatedNextCostUsd = estimatedPosts * 0.0015 + estimatedComments * 0.0015 * 2
  const latestExecution = executionHistory[0]

  return {
    projectId,
    posts: posts.count ?? 0,
    comments: comments.count ?? 0,
    people: people.count ?? 0,
    companies: companies.count ?? 0,
    lastExecutionAt: latestExecution?.completedAt ?? latestExecution?.startedAt ?? null,
    keyword: term.data?.termo ?? null,
    positiveContext: term.data?.contexto_positivo ?? null,
    negativeContext: term.data?.contexto_negativo ?? null,
    lastExecutionOrigin: latestExecution?.origin ?? null,
    monthlyCostUsd,
    estimatedNextCostUsd,
    monitoredSources,
    executionHistory,
  }
}

export async function loadSignalPosts(projectId: string): Promise<SignalPost[]> {
  const { data, error } = await supabase
    .from("posts")
    .select("id, linkedin_url, autor_nome, autor_url, texto, publicado_em, total_reacoes, total_comentarios, total_shares, analise_topico, analise_problema, analise_motivo, analise_coleta, status_curadoria")
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
    analysis: { topic: post.analise_topico, problem: post.analise_problema, reason: post.analise_motivo, collection: post.analise_coleta },
    origin: "monitoring",
  }))
}

export async function loadDiscoveredPosts(projectId: string): Promise<SignalPost[]> {
  const { data, error } = await supabase
    .from("posts_descobertos")
    .select("id, linkedin_url, autor_nome, autor_url, texto, publicado_em, total_reacoes, total_comentarios, total_shares, analise_topico, analise_problema, analise_motivo, analise_coleta, status_curadoria")
    .eq("projeto_id", projectId)
    .order("descoberto_em", { ascending: false })
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
    analysis: { topic: post.analise_topico, problem: post.analise_problema, reason: post.analise_motivo, collection: post.analise_coleta },
    origin: "discovery",
  }))
}

export async function loadSignalSources(projectId: string): Promise<SignalSource[]> {
  const [sourcesResult, postsResult, commentsResult, peopleResult] = await Promise.all([
    supabase.from("fontes").select("id, linkedin_url, nome, status, meta, tipo_watchlist").eq("projeto_id", projectId).neq("status", "descartada").order("status", { ascending: true }).order("criado_em", { ascending: false }),
    supabase.from("posts").select("id, fonte_id, total_reacoes").eq("projeto_id", projectId),
    supabase.from("sinais").select("post_id, pessoa_id").eq("projeto_id", projectId).eq("tipo", "comentou_tema"),
    supabase.from("pessoas").select("id, icp").eq("projeto_id", projectId),
  ])
  const firstError = [sourcesResult, postsResult, commentsResult, peopleResult].find((result) => result.error)?.error
  if (firstError) throw new Error(firstError.message)

  const postSource = new Map((postsResult.data ?? []).flatMap((post) => post.fonte_id ? [[post.id, post.fonte_id] as const] : []))
  const sourceStats = new Map<string, { posts: number; reactions: number; comments: number; people: Set<string>; icp: Set<string> }>()
  for (const post of postsResult.data ?? []) {
    if (!post.fonte_id) continue
    const stats = sourceStats.get(post.fonte_id) ?? { posts: 0, reactions: 0, comments: 0, people: new Set<string>(), icp: new Set<string>() }
    stats.posts += 1
    stats.reactions += post.total_reacoes ?? 0
    sourceStats.set(post.fonte_id, stats)
  }
  const icpByPerson = new Map((peopleResult.data ?? []).map((person) => [person.id, person.icp === true]))
  for (const comment of commentsResult.data ?? []) {
    const sourceId = postSource.get(comment.post_id)
    if (!sourceId) continue
    const stats = sourceStats.get(sourceId) ?? { posts: 0, reactions: 0, comments: 0, people: new Set<string>(), icp: new Set<string>() }
    stats.comments += 1
    stats.people.add(comment.pessoa_id)
    if (icpByPerson.get(comment.pessoa_id)) stats.icp.add(comment.pessoa_id)
    sourceStats.set(sourceId, stats)
  }

  return (sourcesResult.data ?? []).filter((source) => Boolean(source.nome?.trim())).map((source) => {
    const meta = parseSourceMeta(source.meta)
    const observed = sourceStats.get(source.id)
    const hasObservedData = source.status === "monitorada" && Boolean(observed)
    const people = hasObservedData ? observed!.people.size : meta.pessoas ?? 0
    const icp = hasObservedData ? observed!.icp.size : meta.icp ?? 0
    return {
      id: source.id,
      linkedinUrl: source.linkedin_url,
      name: source.nome,
      status: source.status,
      posts: hasObservedData ? observed!.posts : meta.posts ?? 0,
      comments: hasObservedData ? observed!.comments : meta.comentarios ?? 0,
      reactions: hasObservedData ? observed!.reactions : meta.reacoes ?? 0,
      ratio: meta.razao_comentarios_reacoes ?? 0,
      people,
      icp,
      yield: hasObservedData && people > 0 ? Math.round((icp / people) * 100) : null,
      previewPost: meta.pre_visualizacao_post?.trim() || null,
      kind: source.tipo_watchlist === "pessoa" || source.tipo_watchlist === "pagina" ? source.tipo_watchlist : null,
    }
  })
}

export async function loadSignalCompanies(projectId: string): Promise<SignalCompany[]> {
  const [{ data: companies, error: companyError }, { data: people, error: peopleError }, { data: comments, error: commentsError }] = await Promise.all([
    supabase.from("empresas").select("id, nome, setor, porte, linkedin_url").eq("projeto_id", projectId).order("nome"),
    supabase.from("pessoas").select("id, empresa_id").eq("projeto_id", projectId),
    supabase.from("sinais").select("pessoa_id").eq("projeto_id", projectId),
  ])
  const firstError = [companyError, peopleError, commentsError].find(Boolean)
  if (firstError) throw new Error(firstError.message)
  const peopleByCompany = new Map<string, Set<string>>()
  for (const person of people ?? []) if (person.empresa_id) peopleByCompany.set(person.empresa_id, new Set([...(peopleByCompany.get(person.empresa_id) ?? []), person.id]))
  const commentsByCompany = new Map<string, number>()
  const personCompany = new Map((people ?? []).map((person) => [person.id, person.empresa_id]))
  for (const comment of comments ?? []) {
    const companyId = personCompany.get(comment.pessoa_id)
    if (companyId) commentsByCompany.set(companyId, (commentsByCompany.get(companyId) ?? 0) + 1)
  }
  return (companies ?? []).map((company) => ({ id: company.id, name: company.nome, sector: company.setor, size: company.porte, linkedinUrl: company.linkedin_url, people: peopleByCompany.get(company.id)?.size ?? 0, comments: commentsByCompany.get(company.id) ?? 0 }))
}

export async function loadSignalPeople(projectId: string): Promise<SignalPerson[]> {
  const [{ data: people, error: peopleError }, { data: signals, error: signalsError }] = await Promise.all([
    supabase.from("pessoas").select("id, nome, headline, cargo, linkedin_url, senioridade, icp, icp_motivo, email_disponivel, telefone_disponivel, intencao, status, ultimo_sinal_em, criado_em, empresa:empresas(nome)").eq("projeto_id", projectId).order("nome"),
    supabase.from("sinais").select("pessoa_id, tipo, nota, ocorrido_em").eq("projeto_id", projectId),
  ])
  if (peopleError || signalsError) throw new Error(peopleError?.message ?? signalsError?.message ?? "Não foi possível carregar pessoas.")
  const signalsByPerson = new Map<string, Array<{ type: string; score: number | null; occurredAt: string | null }>>()
  for (const signal of signals ?? []) {
    const personSignals = signalsByPerson.get(signal.pessoa_id) ?? []
    personSignals.push({ type: signal.tipo, score: signal.nota, occurredAt: signal.ocorrido_em })
    signalsByPerson.set(signal.pessoa_id, personSignals)
  }
  return (people ?? []).filter((person) => person.nome.trim().toLocaleLowerCase("pt-BR") !== "perfil sem nome").map((person) => {
    const company = Array.isArray(person.empresa) ? person.empresa[0] : person.empresa
    const personSignals = signalsByPerson.get(person.id) ?? []
    const priority = calculateSignalPriority({ currentIntent: person.intencao, status: person.status, signals: personSignals })
    const comments = personSignals.filter((signal) => signal.type === "comentou_tema").length
    return { id: person.id, name: person.nome, headline: person.headline, role: person.cargo, linkedinUrl: person.linkedin_url, seniority: person.senioridade, icp: person.icp, icpReason: person.icp_motivo, companyName: company?.nome ?? null, comments, signalCount: priority.signalCount, signalTypes: priority.signalTypes, priorityScore: priority.score, priorityBucket: priority.bucket, priorityLabel: priority.label, emailAvailable: person.email_disponivel, phoneAvailable: person.telefone_disponivel, intentScore: person.intencao, intentStatus: person.status, lastSignalAt: person.ultimo_sinal_em, createdAt: person.criado_em }
  })
}

export async function loadSignalComments(projectId: string): Promise<SignalComment[]> {
  const [{ data: legacyComments, error: legacyError }, { data: signalComments, error: signalError }] = await Promise.all([
    supabase
    .from("comentarios")
    .select("id, pessoa_id, texto, publicado_em, teor, teor_confianca, pessoa:pessoas!inner(nome, headline, linkedin_url, empresa:empresas(nome)), post:posts!inner(linkedin_url)")
    .eq("projeto_id", projectId)
    .order("coletado_em", { ascending: false })
    .limit(100),
    supabase
      .from("sinais")
      .select("id, pessoa_id, evidencia, ocorrido_em, pessoa:pessoas!inner(nome, headline, linkedin_url, empresa:empresas(nome)), post:posts(linkedin_url)")
      .eq("projeto_id", projectId)
      .eq("tipo", "comentou_tema")
      .order("capturado_em", { ascending: false })
      .limit(100),
  ])

  if (legacyError || signalError) throw new Error(legacyError?.message ?? signalError?.message ?? "Não foi possível carregar as evidências públicas.")
  const legacy = (legacyComments ?? []).map((comment) => {
    const person = Array.isArray(comment.pessoa) ? comment.pessoa[0] : comment.pessoa
    const post = Array.isArray(comment.post) ? comment.post[0] : comment.post
    const company = Array.isArray(person.empresa) ? person.empresa[0] : person.empresa
    return {
      id: comment.id,
      personId: comment.pessoa_id,
      text: comment.texto,
      publishedAt: comment.publicado_em,
      tone: comment.teor,
      personName: person.nome,
      personHeadline: person.headline,
      companyName: company?.nome ?? null,
      personUrl: person.linkedin_url,
      postUrl: post.linkedin_url,
      confidence: comment.teor_confianca,
    }
  })
  const signals = (signalComments ?? []).map((signal) => {
    const person = Array.isArray(signal.pessoa) ? signal.pessoa[0] : signal.pessoa
    const post = Array.isArray(signal.post) ? signal.post[0] : signal.post
    const company = Array.isArray(person.empresa) ? person.empresa[0] : person.empresa
    return {
      id: `signal:${signal.id}`,
      personId: signal.pessoa_id,
      text: signal.evidencia,
      publishedAt: signal.ocorrido_em,
      tone: "comentou_tema",
      personName: person.nome,
      personHeadline: person.headline,
      companyName: company?.nome ?? null,
      personUrl: person.linkedin_url,
      postUrl: post?.linkedin_url ?? "",
      confidence: null,
    }
  })
  return [...legacy, ...signals].sort((first, second) => (second.publishedAt ?? "").localeCompare(first.publishedAt ?? "")).slice(0, 100)
}
