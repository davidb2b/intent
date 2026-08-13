import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { canonicalProfileUrl, normalizeProfileSlug, profileUsername } from "../_shared/profile-identity.ts"
import { assertCallWithinBudget, CostLimitError, createCostBudget, registerActualCost } from "../_shared/cost-control.ts"
import { buildMonitoredProfilePostsInput, MONITORED_PROFILE_POSTS_ACTOR } from "../_shared/monitoring-posts.ts"
import { normalizeCompanyKey, personPersistencePayload } from "../_shared/person-enrichment.ts"
import { hasApifyItemLimit } from "../_shared/apify-result.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type MonitoredSource = { id: string; linkedin_url: string }
type ActorPost = {
  id?: string
  linkedinUrl?: string
  url?: string
  text?: string
  content?: string
  commentary?: string
  postedAt?: string | { date?: string }
  createdAt?: string
  author?: { name?: string; linkedinUrl?: string; id?: string }
  actor?: { name?: string; linkedinUrl?: string; id?: string }
  engagement?: { comments?: number; reactions?: number | unknown[]; shares?: number }
  commentsCount?: number
  reactionsCount?: number
  sharesCount?: number
}
type ActorComment = {
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
    universalName?: string
    experience?: Array<{ position?: string; companyName?: string }>
  }
}
type ProfileDetails = { location?: unknown; country?: string; countryCode?: string; basic_info?: { location?: { country?: string; country_code?: string; full?: string } } }

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
  if (Array.isArray(items) && hasApifyItemLimit(items)) {
    throw new Error("O limite diário gratuito do Apify foi atingido. Aguarde a renovação do limite ou atualize o plano antes de monitorar.")
  }
  return { items: Array.isArray(items) ? items : [], costUsd: Number(run.data?.usageTotalUsd ?? 0) }
}

function dateValue(value: string | { date?: string } | undefined) { return typeof value === "string" ? value : value?.date ?? null }
function countValue(value: number | unknown[] | undefined, fallback?: number) { return Array.isArray(value) ? value.length : value ?? fallback ?? null }
function sourceUrl(value: string) {
  return /(^|\.)linkedin\.com\/in\//i.test(value)
    ? canonicalProfileUrl(value)
    : value.replace(/[?#].*$/, "").replace(/\/$/, "")
}
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const apifyToken = Deno.env.get("APIFY_TOKEN")
  if (!supabaseUrl || !serviceRoleKey || !apifyToken) return json({ error: "Backend não configurado: faltam secrets do Supabase ou Apify." }, 503)

  let body: { projectId?: string; projeto_id?: string; janela?: string; origem?: string; teto_execucao_usd?: number }
  try { body = await request.json() } catch { return json({ error: "JSON inválido." }, 400) }
  const projectId = body.projectId ?? body.projeto_id
  const schedulerSecret = Deno.env.get("SCHEDULER_SECRET")
  const schedulerHeader = request.headers.get("x-scheduler-secret")
  const isScheduled = Boolean(schedulerSecret && schedulerHeader && schedulerHeader === schedulerSecret)
  const authHeader = request.headers.get("Authorization")
  if (!isScheduled && !authHeader) return json({ error: "Faça login para iniciar o monitoramento." }, 401)
  const admin = createClient(supabaseUrl, serviceRoleKey)
  let userId: string | null = null
  if (!isScheduled) {
    const userClient = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader! } } })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: "Sessão inválida. Faça login novamente." }, 401)
    userId = user.id
  }
  const janela = body.janela ?? "month"
  if (!projectId) return json({ error: "projeto_id é obrigatório." }, 400)
  if (!["any", "24h", "week", "month", "3months", "6months", "year"].includes(janela)) return json({ error: "janela inválida." }, 400)
  const projectQuery = admin.from("projetos").select("id").eq("id", projectId)
  const { data: project } = isScheduled ? await projectQuery.maybeSingle() : await projectQuery.eq("owner_id", userId!).maybeSingle()
  if (!project) return json({ error: isScheduled ? "Projeto agendado não encontrado." : "Projeto não encontrado para o usuário autenticado." }, 404)
  const { data: activeExecution } = await admin.from("execucoes").select("id").eq("projeto_id", projectId).eq("status", "rodando").limit(1).maybeSingle()
  if (activeExecution) return json({ error: "Já existe uma execução em andamento para este projeto." }, 409)
  const { data: sources } = await admin.from("fontes").select("id, linkedin_url").eq("projeto_id", projectId).eq("status", "monitorada").order("criado_em", { ascending: true })
  const monitoredSources = (sources ?? []) as MonitoredSource[]
  if (monitoredSources.length === 0) return json({ error: "Nenhuma fonte monitorada. Aprove uma fonte candidata antes de iniciar." }, 400)
  const origin = isScheduled ? "agendada" : body.origem ?? "manual"
  const { data: execution, error: executionError } = await admin.from("execucoes").insert({ projeto_id: projectId, tipo: "monitoramento", status: "rodando", parametros: { janela, origem: origin, fontes: monitoredSources.length } }).select("id").single()
  if (executionError || !execution) return json({ error: "Não foi possível registrar o monitoramento." }, 500)

  let costUsd = 0
  let postsRead = 0
  let commentsRead = 0
  let peopleNew = 0
  const warnings: string[] = []
  try {
    const budget = await createCostBudget(admin, projectId, execution.id, body.teto_execucao_usd)
    const postInput = buildMonitoredProfilePostsInput(monitoredSources.map((source) => source.linkedin_url), janela)
    if (postInput.targetUrls.length === 0) throw new Error("Nenhuma fonte monitorada possui uma URL de perfil válida.")
    assertCallWithinBudget(budget, MONITORED_PROFILE_POSTS_ACTOR, postInput)
    const postResult = await apifyRun(MONITORED_PROFILE_POSTS_ACTOR, postInput, apifyToken)
    costUsd += postResult.costUsd
    registerActualCost(budget, postResult.costUsd)
    await admin.from("custos").insert({ execucao_id: execution.id, actor: MONITORED_PROFILE_POSTS_ACTOR, itens: postResult.items.length, custo_usd: postResult.costUsd })
    const sourceByUrl = new Map(monitoredSources.map((source) => [sourceUrl(source.linkedin_url), source.id]))
    const postRows: Array<{ raw: ActorPost; postId: string; linkedinUrl: string }> = []
    const profileCache = new Map<string, boolean>()
    for (const raw of postResult.items as ActorPost[]) {
      if (!raw.id) continue
      const author = raw.author ?? raw.actor
      const linkedinUrl = sourceUrl(raw.linkedinUrl ?? raw.url ?? "")
      const sourceId = sourceByUrl.get(sourceUrl(author?.linkedinUrl ?? "")) ?? sourceByUrl.get(linkedinUrl)
      if (!sourceId) continue
      const { data: post, error } = await admin.from("posts").upsert({ projeto_id: projectId, fonte_id: sourceId, linkedin_url: linkedinUrl || `https://www.linkedin.com/feed/update/${raw.id}`, post_urn: raw.id, autor_nome: author?.name ?? null, autor_url: author?.linkedinUrl ?? null, texto: raw.text ?? raw.content ?? raw.commentary ?? null, publicado_em: dateValue(raw.postedAt) ?? raw.createdAt ?? null, total_reacoes: countValue(raw.engagement?.reactions, raw.reactionsCount), total_comentarios: countValue(raw.engagement?.comments, raw.commentsCount), total_shares: countValue(raw.engagement?.shares, raw.sharesCount) }, { onConflict: "projeto_id,post_urn" }).select("id, linkedin_url").single()
      if (error || !post) throw new Error(`Não foi possível persistir o post ${raw.id}: ${error?.message ?? "registro ausente"}`)
      postsRead += 1
      postRows.push({ raw, postId: post.id, linkedinUrl: post.linkedinUrl ?? post.linkedin_url })
    }
    for (const { raw, postId, linkedinUrl } of postRows) {
      const commentCount = countValue(raw.engagement?.comments, raw.commentsCount) ?? 0
      if (commentCount === 0) continue
      const commentInput = { posts: [linkedinUrl], maxItems: 200, postedLimit: janela, scrapeReplies: false, profileScraperMode: "main" }
      assertCallWithinBudget(budget, "harvestapi/linkedin-post-comments", commentInput)
      const commentsResult = await apifyRun("harvestapi/linkedin-post-comments", commentInput, apifyToken)
      costUsd += commentsResult.costUsd
      registerActualCost(budget, commentsResult.costUsd)
      await admin.from("custos").insert({ execucao_id: execution.id, actor: "harvestapi/linkedin-post-comments", itens: commentsResult.items.length, custo_usd: commentsResult.costUsd })
      if (commentsResult.items.length >= 200) {
        warnings.push(`O post ${postId} atingiu o limite de 200 comentários; a coleta pode estar truncada.`)
      }
      for (const comment of commentsResult.items as ActorComment[]) {
        const actor = comment.actor
        if (!comment.id || !comment.commentary || !actor?.linkedinUrl) continue
        const actorUrl = sourceUrl(actor.linkedinUrl)
        if (!profileCache.has(actorUrl)) {
          const username = profileUsername(actorUrl)
          const profileInput = { username, includeEmail: false }
          assertCallWithinBudget(budget, "apimaestro/linkedin-profile-detail", profileInput)
          const profile = await apifyRun("apimaestro/linkedin-profile-detail", profileInput, apifyToken)
          costUsd += profile.costUsd
          registerActualCost(budget, profile.costUsd)
          await admin.from("custos").insert({ execucao_id: execution.id, actor: "apimaestro/linkedin-profile-detail", itens: 1, custo_usd: profile.costUsd })
          profileCache.set(actorUrl, isBrazilianProfile(profile.items[0] as ProfileDetails | undefined))
        }
        if (!profileCache.get(actorUrl)) continue
        const slug = normalizeProfileSlug(actorUrl)
        const companyName = actor.experience?.[0]?.companyName?.trim() || null
        let companyId: string | null = null
        if (companyName) {
          const companyKey = normalizeCompanyKey(companyName)
          if (companyKey) {
            const { data: company, error: companyError } = await admin.from("empresas").upsert({ projeto_id: projectId, nome: companyName, nome_chave: companyKey }, { onConflict: "projeto_id,nome_chave" }).select("id").single()
            if (companyError || !company) throw new Error(`Não foi possível persistir a empresa ${companyName}: ${companyError?.message ?? "registro ausente"}`)
            companyId = company.id
          }
        }
        const { data: existingPerson } = await admin.from("pessoas").select("id, revisado_por_humano").eq("projeto_id", projectId).eq("slug", slug).maybeSingle()
        const personPayload = personPersistencePayload({
          linkedinUrl: actorUrl,
          slug,
          name: actor.name ?? "Perfil sem nome",
          headline: actor.headline ?? actor.position ?? null,
          cargo: actor.experience?.[0]?.position ?? null,
          companyId,
          companyName,
          reviewedByHuman: existingPerson?.revisado_por_humano === true,
        })
        const { data: person, error: personError } = existingPerson
          ? await admin.from("pessoas").update(personPayload).eq("id", existingPerson.id).select("id").single()
          : await admin.from("pessoas").insert({ projeto_id: projectId, ...personPayload }).select("id").single()
        if (personError) throw new Error(`Não foi possível persistir a pessoa ${slug}: ${personError.message}`)
        if (!person) continue
        if (!existingPerson) peopleNew += 1
        const { error } = await admin.from("comentarios").upsert({ projeto_id: projectId, post_id: postId, pessoa_id: person.id, comentario_urn: comment.id, texto: comment.commentary, publicado_em: comment.createdAt ?? null }, { onConflict: "projeto_id,comentario_urn" })
        if (!error) commentsRead += 1
      }
    }
    await admin.from("execucoes").update({ status: "concluida", posts_lidos: postsRead, comentarios_lidos: commentsRead, pessoas_novas: peopleNew, custo_usd: costUsd, parametros: { janela, origem: origin, fontes: monitoredSources.length, avisos: warnings }, concluida_em: new Date().toISOString() }).eq("id", execution.id)
    return json({ executionId: execution.id, status: "concluida", postsRead, commentsRead, peopleNew, costUsd, warnings })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido no monitoramento."
    const abortedByCost = error instanceof CostLimitError
    await admin.from("execucoes").update({ status: abortedByCost ? "abortada_por_custo" : "falhou", posts_lidos: postsRead, comentarios_lidos: commentsRead, custo_usd: costUsd, erro: message, concluida_em: new Date().toISOString() }).eq("id", execution.id)
    return json({ error: message, executionId: execution.id }, abortedByCost ? 402 : 502)
  }
})
