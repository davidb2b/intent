import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type SearchPost = {
  id?: string
  linkedinUrl?: string
  text?: string
  content?: string
  commentary?: string
  postedAt?: string | { date?: string }
  createdAt?: string
  actor?: { name?: string; linkedinUrl?: string; id?: string }
  author?: { name?: string; linkedinUrl?: string; id?: string }
  engagement?: { comments?: number; reactions?: number | unknown[]; shares?: number }
}

type ProfileDetails = {
  location?: unknown
  geoLocation?: unknown
  address?: unknown
  country?: string
  countryCode?: string
}

type CommentItem = {
  id?: string
  postId?: string
  commentary?: string
  createdAt?: string
  actor?: {
    id?: string
    name?: string
    linkedinUrl?: string
    headline?: string
    position?: string
    type?: string
    experience?: Array<{ companyName?: string; companyLinkedinUrl?: string; position?: string }>
  }
}

const MAX_POSTS_PER_COLLECTION = 5
const MAX_COMMENTS_PER_POST = 10

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function dateValue(value: string | { date?: string } | undefined) {
  return typeof value === "string" ? value : value?.date ?? null
}

function countValue(value: number | unknown[] | undefined) {
  return Array.isArray(value) ? value.length : value ?? null
}

function normalized(value: unknown) {
  return typeof value === "string" ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : ""
}

function isBrazilianProfile(profile: ProfileDetails | undefined) {
  if (!profile) return false
  const locations = [profile.location, profile.geoLocation, profile.address, profile.country, profile.countryCode]
  const values = locations.flatMap((value) => {
    if (typeof value === "string") return [normalized(value)]
    if (!value || typeof value !== "object") return []
    const item = value as Record<string, unknown>
    return [item.countryCode, item.country, item.countryFull, item.name].map(normalized)
  })
  return values.some((value) => value === "br" || value === "brazil" || value === "brasil" || value.endsWith(", brazil") || value.endsWith(", brasil"))
}

async function apifyRun(actorId: string, input: Record<string, unknown>, token: string): Promise<{ items: unknown[]; costUsd: number }> {
  const start = await fetch(`https://api.apify.com/v2/acts/${actorId.replace("/", "~")}/runs?waitForFinish=120`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!start.ok) throw new Error(`Apify não iniciou o Actor (${start.status}).`)
  const run = await start.json()
  if (run.data?.status !== "SUCCEEDED") throw new Error(`Actor finalizou com status ${run.data?.status ?? "desconhecido"}.`)
  const datasetId = run.data?.defaultDatasetId
  if (!datasetId) throw new Error("Actor não retornou dataset.")
  const output = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?clean=true`, { headers: { Authorization: `Bearer ${token}` } })
  if (!output.ok) throw new Error("Não foi possível ler o dataset do Apify.")
  const items = await output.json()
  return { items: Array.isArray(items) ? items : [], costUsd: Number(run.data?.usageTotalUsd ?? 0) }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const apifyToken = Deno.env.get("APIFY_TOKEN")
  if (!supabaseUrl || !serviceRoleKey || !apifyToken) return json({ error: "Backend não configurado: faltam secrets do Supabase ou Apify." }, 503)

  const authHeader = request.headers.get("Authorization")
  if (!authHeader) return json({ error: "Faça login para iniciar uma coleta." }, 401)
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const userClient = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: "Sessão inválida. Faça login novamente." }, 401)

  let body: { keyword?: string; positiveContext?: string; negativeContext?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: "JSON inválido." }, 400)
  }
  const keyword = body.keyword?.trim()
  if (!keyword) return json({ error: "A palavra-chave é obrigatória." }, 400)

  const { data: project, error: projectError } = await admin.from("projetos").upsert({ owner_id: user.id, nome: "Signal Lab", categoria: keyword }, { onConflict: "owner_id" }).select("id").single()
  if (projectError || !project) return json({ error: `Não foi possível preparar a pesquisa: ${projectError?.message ?? "projeto ausente"}` }, 500)
  const { data: term, error: termError } = await admin.from("termos").upsert({ projeto_id: project.id, termo: keyword, contexto_positivo: body.positiveContext ?? null, contexto_negativo: body.negativeContext ?? null }, { onConflict: "projeto_id,termo" }).select("id").single()
  if (termError || !term) return json({ error: `Não foi possível salvar o termo: ${termError?.message ?? "termo ausente"}` }, 500)
  const { data: execution, error: executionError } = await admin.from("execucoes").insert({ projeto_id: project.id, tipo: "descoberta", status: "rodando", parametros: body }).select("id").single()
  if (executionError || !execution) return json({ error: "Não foi possível registrar a execução." }, 500)

  const { data: activeExecution } = await admin.from("execucoes").select("id").eq("projeto_id", project.id).eq("status", "rodando").neq("id", execution.id).limit(1).maybeSingle()
  if (activeExecution) {
    await admin.from("execucoes").update({ status: "falhou", erro: "Já existe uma coleta em andamento para este projeto.", concluida_em: new Date().toISOString() }).eq("id", execution.id)
    return json({ error: "Já existe uma coleta em andamento para este projeto." }, 409)
  }

  let costUsd = 0
  let postsRead = 0
  const brazilProfileCache = new Map<string, boolean>()

  async function isBrazilian(linkedinUrl: string) {
    const username = linkedinUrl.split("/in/")[1]?.split(/[/?#]/)[0] ?? linkedinUrl
    const cached = brazilProfileCache.get(username)
    if (cached !== undefined) return cached
    const profile = await apifyRun("apimaestro/linkedin-profile-detail", { username, includeEmail: false }, apifyToken)
    costUsd += profile.costUsd
    const details = profile.items[0] as ProfileDetails | undefined
    const result = isBrazilianProfile(details)
    brazilProfileCache.set(username, result)
    return result
  }

  try {
    const search = await apifyRun("harvestapi/linkedin-post-search", { searchQueries: [keyword], maxPosts: MAX_POSTS_PER_COLLECTION, postedLimit: "3months", sortBy: "relevance", scrapeComments: false, scrapeReactions: false }, apifyToken)
    costUsd += search.costUsd
    await admin.from("custos").insert({ execucao_id: execution.id, actor: "harvestapi/linkedin-post-search", itens: search.items.length, custo_usd: search.costUsd })
    let commentsRead = 0
    for (const raw of search.items as SearchPost[]) {
      if (!raw.id || !raw.linkedinUrl) continue
      const author = raw.author ?? raw.actor
      if (!author?.linkedinUrl || !(await isBrazilian(author.linkedinUrl))) continue
      const { data: post, error: postError } = await admin.from("posts").upsert({ projeto_id: project.id, linkedin_url: raw.linkedinUrl, post_urn: raw.id, autor_nome: author?.name ?? null, autor_url: author?.linkedinUrl ?? null, texto: raw.text ?? raw.content ?? raw.commentary ?? null, publicado_em: dateValue(raw.postedAt) ?? raw.createdAt ?? null, total_reacoes: countValue(raw.engagement?.reactions), total_comentarios: raw.engagement?.comments ?? null, total_shares: raw.engagement?.shares ?? null }, { onConflict: "projeto_id,post_urn" }).select("id").single()
      if (postError || !post) throw new Error(`Não foi possível persistir o post ${raw.id}: ${postError?.message ?? "registro ausente"}`)
      postsRead += 1
      if (!raw.engagement?.comments) continue
      const comments = await apifyRun("harvestapi/linkedin-post-comments", { posts: [raw.linkedinUrl], maxItems: MAX_COMMENTS_PER_POST, postedLimit: "3months", scrapeReplies: false, profileScraperMode: "main" }, apifyToken)
      costUsd += comments.costUsd
      await admin.from("custos").insert({ execucao_id: execution.id, actor: "harvestapi/linkedin-post-comments", itens: comments.items.length, custo_usd: comments.costUsd })
      for (const comment of comments.items as CommentItem[]) {
        if (!comment.id || !comment.actor?.linkedinUrl || !comment.commentary) continue
        if (!(await isBrazilian(comment.actor.linkedinUrl))) continue
        const { data: person } = await admin.from("pessoas").upsert({ projeto_id: project.id, linkedin_url: comment.actor.linkedinUrl, slug: comment.actor.linkedinUrl.split("/").filter(Boolean).pop() ?? comment.actor.id ?? comment.id, nome: comment.actor.name ?? "Perfil sem nome", headline: comment.actor.headline ?? comment.actor.position ?? null, cargo: comment.actor.experience?.[0]?.position ?? null }, { onConflict: "projeto_id,slug" }).select("id").single()
        if (!person) continue
        await admin.from("comentarios").upsert({ projeto_id: project.id, post_id: post.id, pessoa_id: person.id, comentario_urn: comment.id, texto: comment.commentary, publicado_em: comment.createdAt ?? null }, { onConflict: "projeto_id,comentario_urn" })
        commentsRead += 1
      }
    }
    await admin.from("execucoes").update({ status: "concluida", posts_lidos: postsRead, comentarios_lidos: commentsRead, custo_usd: costUsd, concluida_em: new Date().toISOString() }).eq("id", execution.id)
    return json({ executionId: execution.id, status: "concluida", postsRead, commentsRead, costUsd })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido na coleta."
    await admin.from("execucoes").update({ status: "falhou", custo_usd: costUsd, erro: message, concluida_em: new Date().toISOString() }).eq("id", execution.id)
    return json({ error: message, executionId: execution.id }, 502)
  }
})
