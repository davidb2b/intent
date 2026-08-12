import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type ActorPost = {
  id?: string
  linkedinUrl?: string
  author?: { name?: string; linkedinUrl?: string; id?: string }
  actor?: { name?: string; linkedinUrl?: string; id?: string }
  engagement?: { comments?: number; reactions?: number | unknown[] }
  commentsCount?: number
  reactionsCount?: number
}

type ProfileDetails = {
  location?: unknown
  country?: string
  countryCode?: string
  basic_info?: { location?: { country?: string; country_code?: string; full?: string } }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function normalized(value: unknown) {
  return typeof value === "string" ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : ""
}

function isBrazilianProfile(profile: ProfileDetails | undefined) {
  if (!profile) return false
  const values = [profile.location, profile.country, profile.countryCode, profile.basic_info?.location].flatMap((value) => {
    if (typeof value === "string") return [normalized(value)]
    if (!value || typeof value !== "object") return []
    const item = value as Record<string, unknown>
    return [item.countryCode, item.country_code, item.country, item.full].map(normalized)
  })
  return values.some((value) => value === "br" || value === "brazil" || value === "brasil" || value.endsWith(", brazil") || value.endsWith(", brasil"))
}

async function apifyRun(actorId: string, input: Record<string, unknown>, token: string) {
  const start = await fetch(`https://api.apify.com/v2/acts/${actorId.replace("/", "~")}/runs?waitForFinish=120`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(45_000),
  })
  if (!start.ok) throw new Error(`Apify não iniciou o Actor (${start.status}).`)
  const run = await start.json()
  if (run.data?.status !== "SUCCEEDED") throw new Error(`Actor finalizou com status ${run.data?.status ?? "desconhecido"}.`)
  const datasetId = run.data?.defaultDatasetId
  if (!datasetId) throw new Error("Actor não retornou dataset.")
  const output = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?clean=true`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) })
  if (!output.ok) throw new Error("Não foi possível ler o dataset do Apify.")
  const items = await output.json()
  if (Array.isArray(items) && items.some((item) => item && typeof item.message === "string" && item.message.toLowerCase().includes("free-tier limit"))) {
    throw new Error("O limite diário gratuito do Apify para perfis foi atingido. Aguarde a renovação do limite ou atualize o plano antes de validar a origem brasileira.")
  }
  return { items: Array.isArray(items) ? items : [], costUsd: Number(run.data?.usageTotalUsd ?? 0) }
}

function profileUrl(post: ActorPost) {
  const author = post.author ?? post.actor
  return author?.linkedinUrl?.replace(/\/$/, "") ?? null
}

function metric(value: number | unknown[] | undefined, fallback?: number) {
  return Array.isArray(value) ? value.length : value ?? fallback ?? 0
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const apifyToken = Deno.env.get("APIFY_TOKEN")
  if (!supabaseUrl || !serviceRoleKey || !apifyToken) return json({ error: "Backend não configurado: faltam secrets do Supabase ou Apify." }, 503)

  const authHeader = request.headers.get("Authorization")
  if (!authHeader) return json({ error: "Faça login para descobrir fontes." }, 401)
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const userClient = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: "Sessão inválida. Faça login novamente." }, 401)

  let body: { projectId?: string; projeto_id?: string; terms?: string[]; termos?: string[]; janela?: string }
  try { body = await request.json() } catch { return json({ error: "JSON inválido." }, 400) }
  const projectId = body.projectId ?? body.projeto_id
  const terms = (body.terms ?? body.termos ?? []).map((term) => term.trim()).filter(Boolean)
  if (!projectId || terms.length === 0) return json({ error: "projeto_id e termos são obrigatórios." }, 400)
  if (body.janela && !["any", "24h", "week", "month", "3months", "6months", "year"].includes(body.janela)) return json({ error: "janela inválida." }, 400)

  const { data: project } = await admin.from("projetos").select("id").eq("id", projectId).eq("owner_id", user.id).maybeSingle()
  if (!project) return json({ error: "Projeto não encontrado para o usuário autenticado." }, 404)
  const { data: activeExecution } = await admin.from("execucoes").select("id").eq("projeto_id", projectId).eq("status", "rodando").limit(1).maybeSingle()
  if (activeExecution) return json({ error: "Já existe uma execução em andamento para este projeto." }, 409)
  const { data: execution, error: executionError } = await admin.from("execucoes").insert({ projeto_id: projectId, tipo: "descoberta", status: "rodando", parametros: { termos: terms, janela: body.janela ?? "3months", origem: "manual" } }).select("id").single()
  if (executionError || !execution) return json({ error: "Não foi possível registrar a descoberta." }, 500)

  let costUsd = 0
  try {
    const result = await apifyRun("harvestapi/linkedin-post-search", { searchQueries: terms, maxPosts: 100, postedLimit: body.janela ?? "3months", sortBy: "relevance", scrapeComments: false, scrapeReactions: false }, apifyToken)
    costUsd = result.costUsd
    await admin.from("custos").insert({ execucao_id: execution.id, actor: "harvestapi/linkedin-post-search", itens: result.items.length, custo_usd: costUsd })

    const grouped = new Map<string, { url: string; name: string | null; posts: number; comments: number; reactions: number; discoveredBy: string }>()
    for (const item of result.items as ActorPost[]) {
      const url = profileUrl(item)
      if (!url) continue
      const author = item.author ?? item.actor
      const comments = metric(item.engagement?.comments, item.commentsCount)
      const reactions = metric(item.engagement?.reactions, item.reactionsCount)
      const current = grouped.get(url) ?? { url, name: author?.name ?? null, posts: 0, comments: 0, reactions: 0, discoveredBy: terms[0] }
      current.posts += 1
      current.comments += comments
      current.reactions += reactions
      if (!current.name && author?.name) current.name = author.name
      grouped.set(url, current)
    }

    const urls = [...grouped.keys()]
    const { data: existing } = urls.length ? await admin.from("fontes").select("linkedin_url").eq("projeto_id", projectId).in("linkedin_url", urls) : { data: [] }
    const existingUrls = new Set((existing ?? []).map((source) => source.linkedin_url))
    const profileCache = new Map<string, boolean>()
    let inserted = 0
    let rejected = 0
    for (const candidate of grouped.values()) {
      if (existingUrls.has(candidate.url)) continue
      if (!profileCache.has(candidate.url)) {
        const username = candidate.url.split("/in/")[1]?.split(/[/?#]/)[0] ?? candidate.url
        const profile = await apifyRun("apimaestro/linkedin-profile-detail", { username, includeEmail: false }, apifyToken)
        costUsd += profile.costUsd
        await admin.from("custos").insert({ execucao_id: execution.id, actor: "apimaestro/linkedin-profile-detail", itens: 1, custo_usd: profile.costUsd })
        profileCache.set(candidate.url, isBrazilianProfile(profile.items[0] as ProfileDetails | undefined))
      }
      if (!profileCache.get(candidate.url)) { rejected += 1; continue }
      const ratio = candidate.reactions > 0 ? candidate.comments / candidate.reactions : candidate.comments > 0 ? candidate.comments : 0
      const { error } = await admin.from("fontes").insert({ projeto_id: projectId, tipo: "perfil", linkedin_url: candidate.url, nome: candidate.name, meta: JSON.stringify({ posts: candidate.posts, comentarios: candidate.comments, reacoes: candidate.reactions, razao_comentarios_reacoes: ratio }), status: "candidata", descoberta_em: candidate.discoveredBy })
      if (!error) inserted += 1
    }
    await admin.from("execucoes").update({ status: "concluida", posts_lidos: result.items.length, custo_usd: costUsd, concluida_em: new Date().toISOString() }).eq("id", execution.id)
    return json({ executionId: execution.id, status: "concluida", candidatesFound: grouped.size, candidatesInserted: inserted, candidatesRejected: rejected, costUsd })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido na descoberta."
    await admin.from("execucoes").update({ status: "falhou", custo_usd: costUsd, erro: message, concluida_em: new Date().toISOString() }).eq("id", execution.id)
    return json({ error: message, executionId: execution.id }, 502)
  }
})
