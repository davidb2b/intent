import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { canonicalProfileUrl, normalizeProfileSlug } from "../_shared/profile-identity.ts"
import { assertCallWithinBudget, CostLimitError, createCostBudget, registerActualCost } from "../_shared/cost-control.ts"
import { buildMonitoredProfilePostsInput, MONITORED_PROFILE_POSTS_ACTOR } from "../_shared/monitoring-posts.ts"
import { normalizeCompanyKey, personPersistencePayload } from "../_shared/person-enrichment.ts"
import { hasApifyItemLimit } from "../_shared/apify-result.ts"
import { isStaleExecution } from "../_shared/execution-lock.ts"
import { usablePersonName } from "../_shared/person-enrichment.ts"
import { matchesTopic } from "../_shared/topic-relevance.ts"
import { buildBrazilProfileBatchInput, isBrazilianProfile, MAX_PROFILES_PER_DISCOVERY, requestedProfileSlugs } from "../_shared/brazil-profile-verification.ts"
import { persistExecutionProgress } from "../_shared/execution-progress.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type MonitoredSource = { id: string; linkedin_url: string; nome: string }
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

const MAX_POSTS_WITH_COMMENTS_PER_RUN = 3
const PERSISTENCE_BATCH_SIZE = 100

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

async function apifyRun(actorId: string, input: Record<string, unknown>, token: string) {
  const start = await fetch(`https://api.apify.com/v2/acts/${actorId.replace("/", "~")}/runs?waitForFinish=120`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(75_000),
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

function batches<T>(items: T[], size = PERSISTENCE_BATCH_SIZE) {
  const output: T[][] = []
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size))
  return output
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
  const { data: activeTerm } = await admin.from("termos").select("termo, contexto_positivo, contexto_negativo").eq("projeto_id", projectId).eq("ativo", true).order("criado_em", { ascending: false }).limit(1).maybeSingle()
  if (!activeTerm) return json({ error: "Nenhum termo ativo foi encontrado para este projeto." }, 400)
  const { data: activeExecution } = await admin.from("execucoes").select("id, iniciada_em").eq("projeto_id", projectId).eq("status", "rodando").limit(1).maybeSingle()
  if (activeExecution && !isStaleExecution(activeExecution.iniciada_em)) return json({ error: "Já existe uma execução em andamento para este projeto." }, 409)
  if (activeExecution) await admin.from("execucoes").update({ status: "falhou", erro: "O monitoramento anterior foi interrompido antes de concluir.", concluida_em: new Date().toISOString() }).eq("id", activeExecution.id)
  const { data: sources } = await admin.from("fontes").select("id, linkedin_url, nome").eq("projeto_id", projectId).eq("status", "monitorada").order("criado_em", { ascending: true })
  const monitoredSources = (sources ?? []) as MonitoredSource[]
  if (monitoredSources.length === 0) return json({ error: "Nenhuma fonte monitorada. Aprove uma fonte candidata antes de iniciar." }, 400)
  const origin = isScheduled ? "agendada" : body.origem ?? "manual"
  const { data: execution, error: executionError } = await admin.from("execucoes").insert({ projeto_id: projectId, tipo: "monitoramento", status: "rodando", parametros: { janela, origem: origin, fontes: monitoredSources.length } }).select("id").single()
  if (executionError || !execution) return json({ error: "Não foi possível registrar o monitoramento." }, 500)

  let costUsd = 0
  let postsRead = 0
    let commentsRead = 0
    let peopleNew = 0
    let incompletePeople = 0
    let outOfTopicPosts = 0
  const warnings: string[] = []
  try {
    await persistExecutionProgress(admin, execution.id, { stage: "lendo_posts", progress: 12, message: "Lendo posts dos perfis monitorados." })
    const budget = await createCostBudget(admin, projectId, execution.id, body.teto_execucao_usd)
    const postInput = buildMonitoredProfilePostsInput(monitoredSources.map((source) => source.linkedin_url), janela)
    if (postInput.targetUrls.length === 0) throw new Error("Nenhuma fonte monitorada possui uma URL de perfil válida.")
    assertCallWithinBudget(budget, MONITORED_PROFILE_POSTS_ACTOR, postInput)
    const postResult = await apifyRun(MONITORED_PROFILE_POSTS_ACTOR, postInput, apifyToken)
    costUsd += postResult.costUsd
    registerActualCost(budget, postResult.costUsd)
    await admin.from("custos").insert({ execucao_id: execution.id, actor: MONITORED_PROFILE_POSTS_ACTOR, itens: postResult.items.length, custo_usd: postResult.costUsd })
    await persistExecutionProgress(admin, execution.id, { stage: "selecionando_conversas", progress: 32, message: "Selecionando os posts com conversas mais relevantes." })
    const sourceByUrl = new Map(monitoredSources.map((source) => [sourceUrl(source.linkedin_url), source.id]))
    const postRows: Array<{ raw: ActorPost; sourceId: string; linkedinUrl: string; authorName: string; authorUrl: string | null; text: string | null }> = []
    const collectedComments: Array<{ comment: ActorComment; postUrn: string }> = []
    for (const raw of postResult.items as ActorPost[]) {
      if (!raw.id) continue
      const author = raw.author ?? raw.actor
      const postText = raw.text ?? raw.content ?? raw.commentary ?? null
      if (!matchesTopic({ text: postText, keyword: activeTerm.termo, positiveContext: activeTerm.contexto_positivo, negativeContext: activeTerm.contexto_negativo })) { outOfTopicPosts += 1; continue }
      const linkedinUrl = sourceUrl(raw.linkedinUrl ?? raw.url ?? "")
      const sourceId = sourceByUrl.get(sourceUrl(author?.linkedinUrl ?? "")) ?? sourceByUrl.get(linkedinUrl)
      if (!sourceId) continue
      const source = monitoredSources.find((item) => item.id === sourceId)
      const authorName = usablePersonName(author?.name, source?.nome)
      if (!authorName) continue
      postRows.push({ raw, sourceId, linkedinUrl: linkedinUrl || `https://www.linkedin.com/feed/update/${raw.id}`, authorName, authorUrl: author?.linkedinUrl ?? source?.linkedin_url ?? null, text: postText })
    }
    const postsWithComments = postRows
      .filter(({ raw }) => (countValue(raw.engagement?.comments, raw.commentsCount) ?? 0) > 0)
      .sort((first, second) => (countValue(second.raw.engagement?.comments, second.raw.commentsCount) ?? 0) - (countValue(first.raw.engagement?.comments, first.raw.commentsCount) ?? 0))
    const commentTargets = postsWithComments.slice(0, MAX_POSTS_WITH_COMMENTS_PER_RUN)
    if (postsWithComments.length > commentTargets.length) warnings.push(`A coleta de comentários foi priorizada nos ${commentTargets.length} posts com maior conversa; os demais serão processados na próxima execução.`)
    const commentInputs = commentTargets.map(({ linkedinUrl }) => ({ posts: [linkedinUrl], maxItems: 50, postedLimit: janela, scrapeReplies: false, profileScraperMode: "main" }))
    for (const commentInput of commentInputs) assertCallWithinBudget(budget, "harvestapi/linkedin-post-comments", commentInput)
    await persistExecutionProgress(admin, execution.id, { stage: "coletando_comentarios", progress: 46, message: `Coletando comentários de ${commentTargets.length} posts com maior conversa.` })
    const commentResults = await Promise.all(commentTargets.map(async (target, index) => ({ target, result: await apifyRun("harvestapi/linkedin-post-comments", commentInputs[index], apifyToken) })))
    for (const { target, result: commentsResult } of commentResults) {
      costUsd += commentsResult.costUsd
      registerActualCost(budget, commentsResult.costUsd)
      await admin.from("custos").insert({ execucao_id: execution.id, actor: "harvestapi/linkedin-post-comments", itens: commentsResult.items.length, custo_usd: commentsResult.costUsd })
      if (commentsResult.items.length >= 50) warnings.push(`O post ${target.raw.id} atingiu o limite de 50 comentários; a coleta pode estar truncada.`)
      for (const comment of commentsResult.items as ActorComment[]) {
        if (!comment.id || !comment.commentary || !comment.actor?.linkedinUrl) continue
        collectedComments.push({ comment, postUrn: target.raw.id! })
      }
    }

    // Verify commenters in bounded batches. A serial profile request for each
    // comment made a normal collection take several minutes and left runs
    // looking stuck, even though posts were already persisted.
    const commenterUrls = [...new Set(collectedComments.map(({ comment }) => sourceUrl(comment.actor!.linkedinUrl!)))]
    const profileCache = new Map<string, boolean>()
    await persistExecutionProgress(admin, execution.id, { stage: "validando_pessoas", progress: 64, message: `Validando a localização de ${commenterUrls.length} pessoas que participaram da conversa.` })
    for (let index = 0; index < commenterUrls.length; index += MAX_PROFILES_PER_DISCOVERY) {
      const batchUrls = commenterUrls.slice(index, index + MAX_PROFILES_PER_DISCOVERY)
      const profileInput = buildBrazilProfileBatchInput(batchUrls)
      try {
        assertCallWithinBudget(budget, "harvestapi/linkedin-profile-scraper", profileInput)
        const profileResult = await apifyRun("harvestapi/linkedin-profile-scraper", profileInput, apifyToken)
        costUsd += profileResult.costUsd
        registerActualCost(budget, profileResult.costUsd)
        await admin.from("custos").insert({ execucao_id: execution.id, actor: "harvestapi/linkedin-profile-scraper", itens: profileResult.items.length, custo_usd: profileResult.costUsd })
        const returnedSlugs = requestedProfileSlugs(batchUrls, profileResult.items as never[])
        const brazilianSlugs = requestedProfileSlugs(batchUrls, (profileResult.items as never[]).filter(isBrazilianProfile))
        for (const url of batchUrls) {
          const slug = normalizeProfileSlug(url)
          profileCache.set(url, returnedSlugs.has(slug) && brazilianSlugs.has(slug))
        }
      } catch (error) {
        if (error instanceof CostLimitError) throw error
        warnings.push(`Não foi possível confirmar em lote ${batchUrls.length} comentaristas; eles foram ignorados para não aceitar perfis sem localização validada.`)
        for (const url of batchUrls) profileCache.set(url, false)
      }
      const completedBatches = Math.ceil((index + batchUrls.length) / MAX_PROFILES_PER_DISCOVERY)
      const totalBatches = Math.max(1, Math.ceil(commenterUrls.length / MAX_PROFILES_PER_DISCOVERY))
      const progress = 64 + Math.round((completedBatches / totalBatches) * 18)
      await persistExecutionProgress(admin, execution.id, { stage: "validando_pessoas", progress, message: `Validando pessoas participantes (${Math.min(index + batchUrls.length, commenterUrls.length)}/${commenterUrls.length}).` })
    }

    // Do not expose partial collections. All calls to external Actors are
    // complete at this point; only now does persistence begin. These writes
    // are batched: serial upserts made ordinary runs appear frozen after the
    // Actors had already finished.
    await persistExecutionProgress(admin, execution.id, { stage: "organizando_sinais", progress: 84, message: "Organizando posts, pessoas e empresas identificadas." })
    const persistedPosts = new Map<string, string>()
    for (const postBatch of batches(postRows)) {
      const { data: posts, error } = await admin.from("posts").upsert(postBatch.map((postRow) => ({
        projeto_id: projectId,
        fonte_id: postRow.sourceId,
        linkedin_url: postRow.linkedinUrl,
        post_urn: postRow.raw.id!,
        autor_nome: postRow.authorName,
        autor_url: postRow.authorUrl,
        texto: postRow.text,
        publicado_em: dateValue(postRow.raw.postedAt) ?? postRow.raw.createdAt ?? null,
        total_reacoes: countValue(postRow.raw.engagement?.reactions, postRow.raw.reactionsCount),
        total_comentarios: countValue(postRow.raw.engagement?.comments, postRow.raw.commentsCount),
        total_shares: countValue(postRow.raw.engagement?.shares, postRow.raw.sharesCount),
      })), { onConflict: "projeto_id,post_urn" }).select("id, post_urn")
      if (error || !posts) throw new Error(`Não foi possível persistir os posts: ${error?.message ?? "registros ausentes"}`)
      for (const post of posts) persistedPosts.set(post.post_urn, post.id)
    }
    postsRead = persistedPosts.size
    await persistExecutionProgress(admin, execution.id, { stage: "organizando_sinais", progress: 88, message: `Posts organizados. Consolidando empresas de ${collectedComments.length} comentários.` })

    type ValidComment = { comment: ActorComment; postUrn: string; actorUrl: string; slug: string; personName: string; companyName: string | null; companyKey: string | null }
    const validComments: ValidComment[] = []
    for (const { comment, postUrn } of collectedComments) {
      const actor = comment.actor!
      const actorUrl = sourceUrl(actor.linkedinUrl!)
      if (!profileCache.get(actorUrl)) continue
      const personName = usablePersonName(actor.name)
      if (!personName) { incompletePeople += 1; continue }
      const companyName = actor.experience?.[0]?.companyName?.trim() || null
      validComments.push({ comment, postUrn, actorUrl, slug: normalizeProfileSlug(actorUrl), personName, companyName, companyKey: companyName ? normalizeCompanyKey(companyName) || null : null })
    }

    const companiesByKey = new Map<string, { name: string; key: string }>()
    for (const item of validComments) if (item.companyName && item.companyKey) companiesByKey.set(item.companyKey, { name: item.companyName, key: item.companyKey })
    const companyIds = new Map<string, string>()
    for (const companyBatch of batches([...companiesByKey.values()])) {
      const { data: companies, error } = await admin.from("empresas").upsert(companyBatch.map((company) => ({ projeto_id: projectId, nome: company.name, nome_chave: company.key })), { onConflict: "projeto_id,nome_chave" }).select("id, nome_chave")
      if (error || !companies) throw new Error(`Não foi possível persistir as empresas: ${error?.message ?? "registros ausentes"}`)
      for (const company of companies) companyIds.set(company.nome_chave, company.id)
    }
    await persistExecutionProgress(admin, execution.id, { stage: "organizando_sinais", progress: 92, message: `Empresas organizadas. Atualizando ${new Set(validComments.map((item) => item.slug)).size} pessoas com perfis validados.` })

    const peopleBySlug = new Map<string, ValidComment>()
    for (const item of validComments) peopleBySlug.set(item.slug, item)
    const existingPeople = new Map<string, { id: string; revisado_por_humano: boolean }>()
    for (const slugBatch of batches([...peopleBySlug.keys()])) {
      const { data, error } = await admin.from("pessoas").select("id, slug, revisado_por_humano").eq("projeto_id", projectId).in("slug", slugBatch)
      if (error) throw new Error(`Não foi possível consultar pessoas existentes: ${error.message}`)
      for (const person of data ?? []) existingPeople.set(person.slug, person)
    }
    const personIds = new Map<string, string>()
    for (const peopleBatch of batches([...peopleBySlug.values()])) {
      const { data: people, error } = await admin.from("pessoas").upsert(peopleBatch.map((item) => {
        const actor = item.comment.actor!
        const existing = existingPeople.get(item.slug)
        return {
          projeto_id: projectId,
          ...personPersistencePayload({
            linkedinUrl: item.actorUrl,
            slug: item.slug,
            name: item.personName,
            headline: actor.headline ?? actor.position ?? null,
            cargo: actor.experience?.[0]?.position ?? null,
            companyId: item.companyKey ? companyIds.get(item.companyKey) ?? null : null,
            companyName: item.companyName,
            reviewedByHuman: existing?.revisado_por_humano === true,
          }),
        }
      }), { onConflict: "projeto_id,slug" }).select("id, slug")
      if (error || !people) throw new Error(`Não foi possível persistir as pessoas: ${error?.message ?? "registros ausentes"}`)
      for (const person of people) personIds.set(person.slug, person.id)
    }
    peopleNew = [...peopleBySlug.keys()].filter((slug) => !existingPeople.has(slug)).length
    await persistExecutionProgress(admin, execution.id, { stage: "organizando_sinais", progress: 96, message: "Pessoas atualizadas. Associando os comentários aos posts coletados." })

    const commentsByUrn = new Map<string, ValidComment>()
    for (const item of validComments) if (persistedPosts.has(item.postUrn) && personIds.has(item.slug)) commentsByUrn.set(item.comment.id!, item)
    for (const commentBatch of batches([...commentsByUrn.values()])) {
      const { error } = await admin.from("comentarios").upsert(commentBatch.map((item) => ({
        projeto_id: projectId,
        post_id: persistedPosts.get(item.postUrn)!,
        pessoa_id: personIds.get(item.slug)!,
        comentario_urn: item.comment.id!,
        texto: item.comment.commentary!,
        publicado_em: item.comment.createdAt ?? null,
      })), { onConflict: "projeto_id,comentario_urn" })
      if (error) throw new Error(`Não foi possível persistir os comentários: ${error.message}`)
    }
    commentsRead = commentsByUrn.size
    if (incompletePeople > 0) warnings.push(`${incompletePeople} comentários foram ignorados porque o perfil não tinha nome público.`)
    if (outOfTopicPosts > 0) warnings.push(`${outOfTopicPosts} posts foram ignorados porque não mencionavam o tema monitorado.`)
    await admin.from("execucoes").update({ status: "concluida", etapa_atual: "concluida", progresso: 100, mensagem_progresso: `${postsRead} posts e ${commentsRead} comentários organizados.`, posts_lidos: postsRead, comentarios_lidos: commentsRead, pessoas_novas: peopleNew, custo_usd: costUsd, parametros: { janela, origem: origin, fontes: monitoredSources.length, avisos: warnings }, concluida_em: new Date().toISOString() }).eq("id", execution.id)
    return json({ executionId: execution.id, status: "concluida", postsRead, commentsRead, peopleNew, costUsd, warnings })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido no monitoramento."
    const abortedByCost = error instanceof CostLimitError
    await admin.from("execucoes").update({ status: abortedByCost ? "abortada_por_custo" : "falhou", etapa_atual: "falhou", mensagem_progresso: message, posts_lidos: postsRead, comentarios_lidos: commentsRead, custo_usd: costUsd, erro: message, concluida_em: new Date().toISOString() }).eq("id", execution.id)
    return json({ error: message, executionId: execution.id }, abortedByCost ? 402 : 502)
  }
})
