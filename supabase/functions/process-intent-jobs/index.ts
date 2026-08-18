import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { runApifyActor, type ApifyRunResult } from "../_shared/apify-client.ts"
import { searchApolloPeople, enrichApolloPerson, enrichApolloPersonByLinkedinUrl, ApolloRequestError } from "../_shared/apollo-client.ts"
import {
  apolloSearchPersonIds,
  assessApolloFit,
  buildApolloCompanyPeopleSearchInput,
  buildPersonJudgmentPayload,
  buildApolloPeopleSearchInput,
  candidateBelongsToCompany,
  isEligibleForRadar,
  normalizeEnrichedApolloPerson,
  personJudgmentCreditReference,
  stripApolloContactFields,
  type ApolloSeedCandidate,
  type BuyerProfile,
  type FitAssessment,
} from "../_shared/intent-phase2-domain.ts"
import { dedupeActivities, normalizeProfileActivityItem, type NormalizedActivity } from "../_shared/intent-activity.ts"
import {
  dedupePostEngagements,
  normalizePostEngagementItem,
  type NormalizedPostEngagement,
} from "../_shared/intent-post-engagement.ts"
import { judgePublicSignal } from "../_shared/intent-signal-llm.ts"
import { normalizeCompanyKey, usablePersonName } from "../_shared/person-enrichment.ts"
import { canonicalProfileUrl, normalizeProfileSlug, profileUsername } from "../_shared/profile-identity.ts"
import { engineBudgetUnits } from "../_shared/intent-engine-budget.ts"
import { qualifiesAuthorForWatchlist } from "../_shared/intent-author-watchlist.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-scheduler-secret",
}

const PRIMARY_ACTORS = {
  comment: "harvestapi/linkedin-profile-comments",
  reaction: "harvestapi/linkedin-profile-reactions",
} as const
const FALLBACK_ACTOR = "scraping_solutions/linkedin-profile-comments-reactions-scraper-no-cookies"
const POST_ENGAGEMENT_ACTORS = {
  comment: {
    primary: "harvestapi/linkedin-post-comments",
    fallback: "apimaestro/linkedin-post-comments-replies-engagements-scraper-no-cookies",
  },
  reaction: {
    primary: "harvestapi/linkedin-post-reactions",
    fallback: "apimaestro/linkedin-post-reactions",
  },
} as const
const RAW_RETENTION_DAYS = 7
const DEFAULT_SEED_SIZE = 5
const DEFAULT_COMPANY_EXPANSION_SIZE = 5
const DEFAULT_POST_ENGAGEMENT_SIZE = 10

type AdminClient = ReturnType<typeof createClient>
type Job = {
  id: string
  projeto_id: string
  tipo: "semear_radar" | "vigiar_pessoa" | "julgar_sinal" | string
  payload: Record<string, unknown>
  lease_token: string
  tentativas: number
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir esta etapa."
}

async function fingerprint(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function auditPayload(admin: AdminClient, input: {
  projectId: string
  jobId: string
  provider: string
  operation: string
  runId?: string | null
  identity: string
  payload: unknown
}) {
  const requestFingerprint = await fingerprint(`${input.projectId}:${input.operation}:${input.identity}`)
  const expiresAt = new Date(Date.now() + RAW_RETENTION_DAYS * 86_400_000).toISOString()
  const { error } = await admin.from("integracao_raw_payloads").upsert({
    projeto_id: input.projectId,
    job_id: input.jobId,
    provider: input.provider,
    operacao: input.operation,
    external_run_id: input.runId ?? null,
    request_fingerprint: requestFingerprint,
    payload: input.payload,
    expira_em: expiresAt,
  }, { onConflict: "provider,operacao,request_fingerprint" })
  if (error) throw new Error(`Falha ao registrar auditoria da integração: ${error.message}`)
}

async function createExecution(admin: AdminClient, projectId: string, type: string, parameters: Record<string, unknown>) {
  const { data, error } = await admin.from("execucoes").insert({
    projeto_id: projectId,
    tipo: type,
    status: "rodando",
    parametros: parameters,
  }).select("id").single()
  if (error || !data) throw new Error(`Falha ao registrar execução: ${error?.message ?? "registro ausente"}`)
  return data.id as string
}

async function finishExecution(admin: AdminClient, executionId: string, input: { status: string; costUsd?: number; people?: number; error?: string | null }) {
  await admin.from("execucoes").update({
    status: input.status,
    custo_usd: input.costUsd ?? 0,
    pessoas_novas: input.people ?? 0,
    erro: input.error ?? null,
    concluida_em: new Date().toISOString(),
  }).eq("id", executionId)
}

async function recordProviderCost(admin: AdminClient, executionId: string, result: ApifyRunResult, operation: string) {
  const { error } = await admin.from("custos").insert({
    execucao_id: executionId,
    actor: result.actor,
    provider: "apify",
    operacao: operation,
    external_run_id: result.runId,
    latencia_ms: result.durationMs,
    itens: result.items.length,
    custo_usd: result.costUsd,
  })
  if (error) throw new Error(`Falha ao registrar custo da coleta: ${error.message}`)
}

async function enqueue(admin: AdminClient, projectId: string, type: string, payload: Record<string, unknown>, priority: number) {
  const { data, error } = await admin.rpc("intent_enqueue_job", {
    target_project_id: projectId,
    target_type: type,
    target_payload: payload,
    target_priority: priority,
    target_max_attempts: 3,
  })
  if (error || !data) throw new Error(`Falha ao preparar a próxima etapa: ${error?.message ?? "job ausente"}`)
  return data as string
}

function safeCompanyCandidate(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const company = value as Record<string, unknown>
  return typeof company.name === "string" && company.name.trim() ? company : null
}

type RadarOrigin = "semente_apollo" | "cascata_empresa" | "cascata_post"

async function upsertRadarPerson(admin: AdminClient, input: {
  projectId: string
  candidate: ApolloSeedCandidate
  fit: FitAssessment
  origin: RadarOrigin
  companyId?: string | null
}) {
  const slug = normalizeProfileSlug(input.candidate.linkedinUrl)
  const { data: existing, error: existingError } = await admin.from("pessoas")
    .select("id, empresa_id")
    .eq("projeto_id", input.projectId)
    .eq("slug", slug)
    .maybeSingle()
  if (existingError) throw new Error(`Falha ao verificar pessoa no radar: ${existingError.message}`)

  let personId: string
  let inserted = false
  if (existing) {
    personId = existing.id
    const { error: personError } = await admin.from("pessoas").update({
      nome: input.candidate.name,
      linkedin_url: input.candidate.linkedinUrl,
      headline: input.candidate.headline,
      cargo: input.candidate.title,
      empresa_id: input.companyId ?? existing.empresa_id,
    }).eq("id", existing.id).eq("projeto_id", input.projectId)
    if (personError) throw new Error(`Falha ao atualizar pessoa no radar: ${personError.message}`)
  } else {
    const { data: created, error: personError } = await admin.from("pessoas").insert({
      projeto_id: input.projectId,
      empresa_id: input.companyId ?? null,
      linkedin_url: input.candidate.linkedinUrl,
      slug,
      nome: input.candidate.name,
      headline: input.candidate.headline,
      cargo: input.candidate.title,
      senioridade: null,
      icp: true,
      icp_motivo: null,
      status: "vigiado",
    }).select("id").single()
    if (personError || !created) throw new Error(`Falha ao preparar pessoa no radar: ${personError?.message ?? "registro ausente"}`)
    personId = created.id
    inserted = true
  }

  const { data: existingOperation, error: existingOperationError } = await admin.from("pessoa_operacao_privada")
    .select("origem")
    .eq("pessoa_id", personId)
    .maybeSingle()
  if (existingOperationError) throw new Error(`Falha ao verificar a origem privada da pessoa: ${existingOperationError.message}`)

  const now = new Date().toISOString()
  const { error: operationError } = await admin.from("pessoa_operacao_privada").upsert({
    pessoa_id: personId,
    projeto_id: input.projectId,
    origem: existingOperation?.origem ?? input.origin,
    fit: input.fit.score,
    excluido: input.fit.excluded,
    fit_evidencia: input.fit.reasons,
    apollo_id: input.candidate.apolloId,
    localizacao_status: "brasil_confirmado",
    pais_literal: input.candidate.country,
    localizacao_evidencia: {
      country: input.candidate.country,
      city: input.candidate.city,
      state: input.candidate.state,
      provider: "apollo_people_match",
    },
    empresa_candidata: input.candidate.company,
    verificado_em: now,
    ultima_verificacao_em: now,
    atualizado_em: now,
  }, { onConflict: "pessoa_id" })
  if (operationError) throw new Error(`Falha ao registrar validação regional: ${operationError.message}`)

  return { personId, inserted }
}

async function processSeedJob(admin: AdminClient, job: Job, apolloKey: string) {
  const icpId = typeof job.payload.icp_id === "string" ? job.payload.icp_id : ""
  const executionId = await createExecution(admin, job.projeto_id, "semente", { job_id: job.id, icp_id: icpId })
  let inserted = 0
  try {
    const { data: icp, error: icpError } = await admin.from("icps")
      .select("id, status, comprador")
      .eq("id", icpId).eq("projeto_id", job.projeto_id).maybeSingle()
    if (icpError || !icp || icp.status !== "ativo") throw new Error("O perfil ideal ativo não foi encontrado para esta descoberta.")

    const searchInput = buildApolloPeopleSearchInput(icp.comprador as BuyerProfile, DEFAULT_SEED_SIZE)
    const search = await searchApolloPeople(searchInput, apolloKey)
    await auditPayload(admin, {
      projectId: job.projeto_id,
      jobId: job.id,
      provider: "apollo",
      operation: "people_search",
      runId: search.requestId,
      identity: await fingerprint(JSON.stringify(searchInput)),
      payload: stripApolloContactFields(search.payload),
    })

    const ids = apolloSearchPersonIds(search.payload).slice(0, DEFAULT_SEED_SIZE)
    for (const apolloId of ids) {
      const enriched = await enrichApolloPerson(apolloId, apolloKey)
      const candidate = normalizeEnrichedApolloPerson(enriched.payload)
      await auditPayload(admin, {
        projectId: job.projeto_id,
        jobId: job.id,
        provider: "apollo",
        operation: "regional_enrichment",
        runId: enriched.requestId,
        identity: apolloId,
        payload: stripApolloContactFields(enriched.payload),
      })
      if (!candidate) continue

      const fit = assessApolloFit(candidate, icp.comprador as BuyerProfile)
      if (!isEligibleForRadar(fit)) continue
      const { personId, inserted: wasInserted } = await upsertRadarPerson(admin, {
        projectId: job.projeto_id,
        candidate,
        fit,
        origin: "semente_apollo",
      })
      if (wasInserted) inserted += 1

      await enqueue(admin, job.projeto_id, "vigiar_pessoa", { pessoa_id: personId, icp_id: icp.id }, 40)
    }

    await finishExecution(admin, executionId, { status: "concluida", people: inserted })
    return { inserted, searched: ids.length }
  } catch (error) {
    await finishExecution(admin, executionId, { status: "falhou", people: inserted, error: errorMessage(error) })
    throw error
  }
}

function emptyRunState(result: ApifyRunResult) {
  if (result.items.length > 0) return "activity_available" as const
  const logs = result.logMessages.join("\n").toLowerCase()
  if (
    logs.includes("no valid source provided")
    || logs.includes("profile not found")
    || logs.includes("profile unavailable")
    || logs.includes("post not found")
    || logs.includes("post unavailable")
  ) return "profile_unavailable" as const
  return "no_activity" as const
}

async function collectPrimaryActivity(profileUrl: string, type: "comment" | "reaction", token: string) {
  const result = await runApifyActor(PRIMARY_ACTORS[type], {
    profiles: [profileUrl],
    maxItems: 5,
    postedLimit: "month",
  }, token)
  return { result, state: emptyRunState(result), fallback: false }
}

async function collectFallbackActivity(profileUrl: string, type: "comment" | "reaction", token: string) {
  const now = new Date()
  const from = new Date(now.getTime() - 31 * 86_400_000)
  const result = await runApifyActor(FALLBACK_ACTOR, {
    usernames: [profileUsername(profileUrl)],
    type: type === "comment" ? "comments" : "reactions",
    maxItemsPerProfile: 20,
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: now.toISOString().slice(0, 10),
  }, token)
  const hasTypedError = result.items.some((item) => item && typeof item === "object" && ((item as Record<string, unknown>).sourceType === "error" || (item as Record<string, unknown>).type === "error"))
  return { result, state: hasTypedError ? "profile_unavailable" as const : emptyRunState(result), fallback: true }
}

async function activityForType(profileUrl: string, type: "comment" | "reaction", token: string) {
  try {
    const primary = await collectPrimaryActivity(profileUrl, type, token)
    if (primary.state !== "profile_unavailable") return [primary]
    const fallback = await collectFallbackActivity(profileUrl, type, token)
    return [primary, fallback]
  } catch (primaryError) {
    try {
      return [await collectFallbackActivity(profileUrl, type, token)]
    } catch (fallbackError) {
      throw new Error(`A atividade pública não pôde ser consultada pelos provedores disponíveis: ${errorMessage(primaryError)} ${errorMessage(fallbackError)}`)
    }
  }
}

async function collectPrimaryPostEngagement(postUrl: string, type: "comment" | "reaction", token: string) {
  const input = type === "comment"
    ? {
      posts: [postUrl],
      maxItems: DEFAULT_POST_ENGAGEMENT_SIZE,
      postedLimit: "3months",
      scrapeReplies: false,
      profileScraperMode: "main",
    }
    : {
      posts: [postUrl],
      maxItems: DEFAULT_POST_ENGAGEMENT_SIZE,
      profileScraperMode: "main",
    }
  const result = await runApifyActor(POST_ENGAGEMENT_ACTORS[type].primary, input, token)
  return { result, state: emptyRunState(result), fallback: false, type }
}

async function collectFallbackPostEngagement(postUrl: string, type: "comment" | "reaction", token: string) {
  const input = type === "comment"
    ? { postIds: [postUrl] }
    : { post_urls: [postUrl], page_number: 1, reaction_type: "ALL", limit: DEFAULT_POST_ENGAGEMENT_SIZE }
  const result = await runApifyActor(POST_ENGAGEMENT_ACTORS[type].fallback, input, token)
  const hasTypedError = result.items.some((item) => item && typeof item === "object" && (
    (item as Record<string, unknown>).sourceType === "error"
    || (item as Record<string, unknown>).type === "error"
  ))
  return {
    result,
    state: hasTypedError ? "profile_unavailable" as const : emptyRunState(result),
    fallback: true,
    type,
  }
}

async function postEngagementForType(postUrl: string, type: "comment" | "reaction", token: string) {
  try {
    const primary = await collectPrimaryPostEngagement(postUrl, type, token)
    if (primary.state !== "profile_unavailable") return [primary]
    return [primary, await collectFallbackPostEngagement(postUrl, type, token)]
  } catch (primaryError) {
    try {
      return [await collectFallbackPostEngagement(postUrl, type, token)]
    } catch (fallbackError) {
      throw new Error(`Os engajamentos do post não puderam ser consultados pelos provedores disponíveis: ${errorMessage(primaryError)} ${errorMessage(fallbackError)}`)
    }
  }
}

async function processWatchPersonJob(admin: AdminClient, job: Job, apifyToken: string) {
  const personId = typeof job.payload.pessoa_id === "string" ? job.payload.pessoa_id : ""
  const icpId = typeof job.payload.icp_id === "string" ? job.payload.icp_id : ""
  const executionId = await createExecution(admin, job.projeto_id, "vigilia", { job_id: job.id, pessoa_id: personId, icp_id: icpId })
  let totalCost = 0
  try {
    const { data: person } = await admin.from("pessoas").select("id, linkedin_url, empresa_id").eq("id", personId).eq("projeto_id", job.projeto_id).maybeSingle()
    const { data: operation } = await admin.from("pessoa_operacao_privada").select("fit, excluido, localizacao_status").eq("pessoa_id", personId).maybeSingle()
    if (!person || !operation || operation.localizacao_status !== "brasil_confirmado" || operation.excluido || Number(operation.fit ?? 0) < 60) {
      throw new Error("A pessoa não atende aos critérios privados para observação.")
    }

    const [commentRuns, reactionRuns] = await Promise.all([
      activityForType(person.linkedin_url, "comment", apifyToken),
      activityForType(person.linkedin_url, "reaction", apifyToken),
    ])
    const runs = [...commentRuns, ...reactionRuns]
    for (const run of runs) {
      totalCost += run.result.costUsd
      await recordProviderCost(admin, executionId, run.result, run.fallback ? "profile_activity_fallback" : "profile_activity_primary")
      await auditPayload(admin, {
        projectId: job.projeto_id,
        jobId: job.id,
        provider: "apify",
        operation: run.result.actor,
        runId: run.result.runId,
        identity: `${personId}:${run.result.actor}`,
        payload: { items: run.result.items, state: run.state },
      })
    }

    const unavailable = runs.every((run) => run.state === "profile_unavailable")
    const rawActivities: NormalizedActivity[] = []
    for (const run of commentRuns) rawActivities.push(...run.result.items.flatMap((item) => normalizeProfileActivityItem(item, "comment") ?? []))
    for (const run of reactionRuns) rawActivities.push(...run.result.items.flatMap((item) => normalizeProfileActivityItem(item, "reaction") ?? []))
    const activities = dedupeActivities(rawActivities)
    const activityStatus = activities.length ? "activity_available" : unavailable ? "profile_unavailable" : "no_activity"

    await admin.from("pessoa_operacao_privada").update({
      atividade_status: activityStatus,
      atividade_verificada_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    }).eq("pessoa_id", personId)

    const pendingCandidateIds: string[] = []
    for (const activity of activities) {
      const { data: post, error: postError } = await admin.from("posts").upsert({
        projeto_id: job.projeto_id,
        linkedin_url: activity.postUrl,
        post_urn: activity.postUrn,
        autor_nome: activity.postAuthorName,
        autor_url: activity.postAuthorUrl,
        texto: activity.context,
        publicado_em: activity.occurredAt,
      }, { onConflict: "projeto_id,post_urn" }).select("id").single()
      if (postError || !post) throw new Error(`Falha ao preservar a origem pública do sinal: ${postError?.message ?? "post ausente"}`)

      const uniqueUrn = `intent:${await fingerprint(`${activity.type}:${activity.externalId}`)}`
      const { data: candidate, error: candidateError } = await admin.from("sinais_candidatos_privados").upsert({
        projeto_id: job.projeto_id,
        pessoa_id: personId,
        empresa_id: person.empresa_id,
        post_id: post.id,
        icp_id: icpId,
        tipo: activity.type === "comment" ? "comentou_tema" : "atividade_fraca",
        urn_unico: uniqueUrn,
        evidencia: activity.evidence,
        contexto: activity.context,
        post_url: activity.postUrl,
        ocorrido_em: activity.occurredAt,
        provider: "apify",
        provider_run_id: runs.find((run) => run.result.items.some((item) => normalizeProfileActivityItem(item, activity.type)?.externalId === activity.externalId))?.result.runId ?? null,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: "projeto_id,urn_unico" }).select("id,status").single()
      if (candidateError || !candidate) throw new Error(`Falha ao preparar sinal para julgamento: ${candidateError?.message ?? "sinal ausente"}`)
      if (candidate.status === "pendente") pendingCandidateIds.push(candidate.id)
    }

    if (pendingCandidateIds.length > 0) {
      await enqueue(admin, job.projeto_id, "julgar_sinal", buildPersonJudgmentPayload(personId, pendingCandidateIds, job.id), 20)
    }

    await finishExecution(admin, executionId, { status: activities.length ? "concluida" : "parcial", costUsd: totalCost })
    return { activities: activities.length, activityStatus, costUsd: totalCost }
  } catch (error) {
    await finishExecution(admin, executionId, { status: "falhou", costUsd: totalCost, error: errorMessage(error) })
    await admin.from("pessoa_operacao_privada").update({ atividade_status: "provider_error", atividade_verificada_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq("pessoa_id", personId)
    throw error
  }
}

function signalRules(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  const rules = (value as Record<string, unknown>).regras
  if (!Array.isArray(rules)) return []
  return rules.flatMap((rule) => {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) return []
    const item = rule as Record<string, unknown>
    if (typeof item.nome !== "string" || !item.nome.trim()) return []
    return [{
      nome: item.nome.trim(),
      prioridade: typeof item.prioridade === "string" ? item.prioridade : undefined,
      descricao: typeof item.descricao === "string" ? item.descricao : undefined,
      palavras_chave: Array.isArray(item.palavras_chave) ? item.palavras_chave.filter((word): word is string => typeof word === "string") : undefined,
    }]
  })
}

async function materializeCompany(admin: AdminClient, projectId: string, personId: string, companyValue: unknown) {
  const company = safeCompanyCandidate(companyValue)
  if (!company) return null
  const name = String(company.name).trim()
  const key = normalizeCompanyKey(name)
  const { data, error } = await admin.from("empresas").upsert({
    projeto_id: projectId,
    nome: name,
    nome_chave: key,
    linkedin_url: typeof company.linkedinUrl === "string" ? company.linkedinUrl : null,
    setor: typeof company.industry === "string" ? company.industry : null,
    porte: Number.isInteger(company.employeeCount) ? String(company.employeeCount) : null,
    icp: true,
  }, { onConflict: "projeto_id,nome_chave" }).select("id").single()
  if (error || !data) throw new Error(`Falha ao materializar empresa do sinal: ${error?.message ?? "empresa ausente"}`)
  await admin.from("pessoas").update({ empresa_id: data.id }).eq("id", personId)

  const apolloId = typeof company.apolloId === "string" && company.apolloId.trim() ? company.apolloId.trim() : null
  const domain = typeof company.domain === "string" && company.domain.trim() ? company.domain.trim().toLowerCase() : null
  if (apolloId || domain) {
    const { error: operationError } = await admin.from("empresa_operacao_privada").upsert({
      empresa_id: data.id,
      projeto_id: projectId,
      apollo_id: apolloId,
      dominio: domain,
      nome_literal: name,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: "empresa_id" })
    if (operationError) throw new Error(`Falha ao preparar a expansão da empresa: ${operationError.message}`)
  }
  return data.id as string
}

async function processCompanyCascadeJob(admin: AdminClient, job: Job, apolloKey: string) {
  const companyId = typeof job.payload.empresa_id === "string" ? job.payload.empresa_id : ""
  const icpId = typeof job.payload.icp_id === "string" ? job.payload.icp_id : ""
  const executionId = await createExecution(admin, job.projeto_id, "cascata", {
    job_id: job.id,
    empresa_id: companyId,
    icp_id: icpId,
    origem: "empresa",
  })
  let inserted = 0
  let accepted = 0
  let enrichedCount = 0

  try {
    const { data: company, error: companyError } = await admin.from("empresa_operacao_privada")
      .select("empresa_id, apollo_id, dominio, nome_literal")
      .eq("empresa_id", companyId)
      .eq("projeto_id", job.projeto_id)
      .maybeSingle()
    if (companyError || !company) throw new Error("A empresa ainda não possui uma identidade confirmada para expansão.")

    const { data: icp, error: icpError } = await admin.from("icps")
      .select("id, status, comprador")
      .eq("id", icpId)
      .eq("projeto_id", job.projeto_id)
      .maybeSingle()
    if (icpError || !icp || icp.status !== "ativo") throw new Error("O perfil ideal ativo não foi encontrado para esta expansão.")

    const now = new Date().toISOString()
    const { error: startError } = await admin.from("empresa_operacao_privada").update({
      expansao_icp_id: icp.id,
      expansao_status: "rodando",
      ultimo_erro: null,
      atualizado_em: now,
    }).eq("empresa_id", companyId).eq("projeto_id", job.projeto_id)
    if (startError) throw new Error(`Falha ao iniciar expansão da empresa: ${startError.message}`)

    const companyIdentity = {
      apolloId: company.apollo_id as string | null,
      domain: company.dominio as string | null,
      name: company.nome_literal as string,
    }
    const searchInput = buildApolloCompanyPeopleSearchInput(icp.comprador as BuyerProfile, companyIdentity, DEFAULT_COMPANY_EXPANSION_SIZE)
    const search = await searchApolloPeople(searchInput, apolloKey)
    await auditPayload(admin, {
      projectId: job.projeto_id,
      jobId: job.id,
      provider: "apollo",
      operation: "company_people_search",
      runId: search.requestId,
      identity: await fingerprint(JSON.stringify(searchInput)),
      payload: stripApolloContactFields(search.payload),
    })

    const ids = apolloSearchPersonIds(search.payload).slice(0, DEFAULT_COMPANY_EXPANSION_SIZE)
    const existingIds = new Set<string>()
    if (ids.length > 0) {
      const { data: existingOperations, error: existingError } = await admin.from("pessoa_operacao_privada")
        .select("apollo_id")
        .eq("projeto_id", job.projeto_id)
        .in("apollo_id", ids)
      if (existingError) throw new Error(`Falha ao verificar pessoas já conhecidas: ${existingError.message}`)
      for (const operation of existingOperations ?? []) {
        if (typeof operation.apollo_id === "string") existingIds.add(operation.apollo_id)
      }
    }

    for (const apolloId of ids) {
      if (existingIds.has(apolloId)) continue
      const enriched = await enrichApolloPerson(apolloId, apolloKey)
      enrichedCount += 1
      const candidate = normalizeEnrichedApolloPerson(enriched.payload)
      await auditPayload(admin, {
        projectId: job.projeto_id,
        jobId: job.id,
        provider: "apollo",
        operation: "company_person_enrichment",
        runId: enriched.requestId,
        identity: apolloId,
        payload: stripApolloContactFields(enriched.payload),
      })
      if (!candidate || !candidateBelongsToCompany(candidate, companyIdentity)) continue

      const fit = assessApolloFit(candidate, icp.comprador as BuyerProfile)
      if (!isEligibleForRadar(fit)) continue
      const radar = await upsertRadarPerson(admin, {
        projectId: job.projeto_id,
        candidate,
        fit,
        origin: "cascata_empresa",
        companyId,
      })
      if (radar.inserted) inserted += 1
      accepted += 1
      await enqueue(admin, job.projeto_id, "vigiar_pessoa", { pessoa_id: radar.personId, icp_id: icp.id }, 40)
    }

    const completedAt = new Date().toISOString()
    const { error: completeError } = await admin.from("empresa_operacao_privada").update({
      expansao_icp_id: icp.id,
      expansao_status: "concluida",
      expandida_em: completedAt,
      ultimo_erro: null,
      atualizado_em: completedAt,
    }).eq("empresa_id", companyId).eq("projeto_id", job.projeto_id)
    if (completeError) throw new Error(`Falha ao concluir expansão da empresa: ${completeError.message}`)

    await finishExecution(admin, executionId, { status: "concluida", people: inserted })
    return { searched: ids.length, enriched: enrichedCount, inserted, accepted }
  } catch (error) {
    await admin.from("empresa_operacao_privada").update({
      expansao_status: "falhou",
      ultimo_erro: errorMessage(error),
      atualizado_em: new Date().toISOString(),
    }).eq("empresa_id", companyId).eq("projeto_id", job.projeto_id)
    await finishExecution(admin, executionId, { status: "falhou", people: inserted, error: errorMessage(error) })
    throw error
  }
}

async function processPostCascadeJob(admin: AdminClient, job: Job, secrets: { apollo: string; apify: string }) {
  const postId = typeof job.payload.post_id === "string" ? job.payload.post_id : ""
  const icpId = typeof job.payload.icp_id === "string" ? job.payload.icp_id : ""
  const executionId = await createExecution(admin, job.projeto_id, "cascata", {
    job_id: job.id,
    post_id: postId,
    icp_id: icpId,
    origem: "post",
  })
  let totalCost = 0
  let inserted = 0
  let accepted = 0
  let evaluated = 0

  try {
    const { data: post, error: postError } = await admin.from("posts")
      .select("id, linkedin_url, texto")
      .eq("id", postId)
      .eq("projeto_id", job.projeto_id)
      .maybeSingle()
    if (postError || !post?.linkedin_url) throw new Error("O post qualificado não foi encontrado para expansão.")

    const { data: icp, error: icpError } = await admin.from("icps")
      .select("id, status, comprador")
      .eq("id", icpId)
      .eq("projeto_id", job.projeto_id)
      .maybeSingle()
    if (icpError || !icp || icp.status !== "ativo") throw new Error("O perfil ideal ativo não foi encontrado para esta expansão.")

    const now = new Date().toISOString()
    const { error: startError } = await admin.from("post_operacao_privada").upsert({
      post_id: postId,
      icp_id: icp.id,
      projeto_id: job.projeto_id,
      expansao_status: "rodando",
      ultimo_erro: null,
      atualizado_em: now,
    }, { onConflict: "post_id,icp_id" })
    if (startError) throw new Error(`Falha ao iniciar a expansão do post: ${startError.message}`)

    const [commentRuns, reactionRuns] = await Promise.all([
      postEngagementForType(post.linkedin_url, "comment", secrets.apify),
      postEngagementForType(post.linkedin_url, "reaction", secrets.apify),
    ])
    const runs = [...commentRuns, ...reactionRuns]
    const sourceByEngagement = new Map<string, { actor: string; runId: string }>()
    const normalized: NormalizedPostEngagement[] = []
    for (const run of runs) {
      totalCost += run.result.costUsd
      await recordProviderCost(admin, executionId, run.result, run.fallback ? "post_engagement_fallback" : "post_engagement_primary")
      await auditPayload(admin, {
        projectId: job.projeto_id,
        jobId: job.id,
        provider: "apify",
        operation: run.result.actor,
        runId: run.result.runId,
        identity: `${postId}:${run.type}:${run.result.actor}`,
        payload: { items: run.result.items, state: run.state },
      })
      for (const item of run.result.items) {
        const engagement = normalizePostEngagementItem(item, run.type)
        if (!engagement) continue
        normalized.push(engagement)
        sourceByEngagement.set(`${engagement.type}:${engagement.externalId}`, {
          actor: run.result.actor,
          runId: run.result.runId,
        })
      }
    }

    const engagements = dedupePostEngagements(normalized)
    const engagementsBySlug = new Map<string, NormalizedPostEngagement[]>()
    for (const engagement of engagements) {
      const group = engagementsBySlug.get(engagement.profileSlug) ?? []
      group.push(engagement)
      engagementsBySlug.set(engagement.profileSlug, group)
    }
    const prioritizedPeople = [...engagementsBySlug.entries()]
      .sort((first, second) => Number(second[1].some((item) => item.type === "comment")) - Number(first[1].some((item) => item.type === "comment")))
      .slice(0, DEFAULT_POST_ENGAGEMENT_SIZE)
    const slugs = prioritizedPeople.map(([slug]) => slug)

    const existingPeople = new Map<string, { id: string; empresa_id: string | null }>()
    if (slugs.length > 0) {
      const { data: people, error: peopleError } = await admin.from("pessoas")
        .select("id, slug, empresa_id")
        .eq("projeto_id", job.projeto_id)
        .in("slug", slugs)
      if (peopleError) throw new Error(`Falha ao verificar pessoas já conhecidas no post: ${peopleError.message}`)
      for (const person of people ?? []) existingPeople.set(person.slug, { id: person.id, empresa_id: person.empresa_id })
    }

    const operationByPerson = new Map<string, { fit: number | null; excluido: boolean; localizacao_status: string }>()
    const existingPersonIds = [...existingPeople.values()].map((person) => person.id)
    if (existingPersonIds.length > 0) {
      const { data: operations, error: operationsError } = await admin.from("pessoa_operacao_privada")
        .select("pessoa_id, fit, excluido, localizacao_status")
        .eq("projeto_id", job.projeto_id)
        .in("pessoa_id", existingPersonIds)
      if (operationsError) throw new Error(`Falha ao verificar o radar privado: ${operationsError.message}`)
      for (const operation of operations ?? []) operationByPerson.set(operation.pessoa_id, operation)
    }

    const pendingByPerson = new Map<string, string[]>()
    for (const [slug, personEngagements] of prioritizedPeople) {
      evaluated += 1
      const existing = existingPeople.get(slug)
      const existingOperation = existing ? operationByPerson.get(existing.id) : null
      let personId: string | null = null
      let companyId = existing?.empresa_id ?? null
      let shouldStartWatch = false

      if (
        existing
        && existingOperation?.localizacao_status === "brasil_confirmado"
        && !existingOperation.excluido
        && Number(existingOperation.fit ?? 0) >= 60
      ) {
        personId = existing.id
      } else if (!existingOperation) {
        const representative = personEngagements.find((item) => item.type === "comment") ?? personEngagements[0]
        const enriched = await enrichApolloPersonByLinkedinUrl(representative.profileUrl, secrets.apollo)
        await auditPayload(admin, {
          projectId: job.projeto_id,
          jobId: job.id,
          provider: "apollo",
          operation: "post_engager_regional_enrichment",
          runId: enriched.requestId,
          identity: representative.profileSlug,
          payload: stripApolloContactFields(enriched.payload),
        })
        const candidate = normalizeEnrichedApolloPerson(enriched.payload)
        if (!candidate) continue
        const fit = assessApolloFit(candidate, icp.comprador as BuyerProfile)
        if (!isEligibleForRadar(fit)) continue
        const radar = await upsertRadarPerson(admin, {
          projectId: job.projeto_id,
          candidate,
          fit,
          origin: "cascata_post",
        })
        personId = radar.personId
        companyId = null
        shouldStartWatch = true
        if (radar.inserted) inserted += 1
      }

      if (!personId) continue
      accepted += 1
      if (shouldStartWatch) {
        await enqueue(admin, job.projeto_id, "vigiar_pessoa", { pessoa_id: personId, icp_id: icp.id }, 40)
      }

      const engagementDates = personEngagements
        .flatMap((engagement) => engagement.occurredAt ? [engagement.occurredAt] : [])
        .sort()
      const { error: relationError } = await admin.from("post_engajadores_privados").upsert({
        post_id: postId,
        pessoa_id: personId,
        icp_id: icp.id,
        projeto_id: job.projeto_id,
        comentou: personEngagements.some((engagement) => engagement.type === "comment"),
        reagiu: personEngagements.some((engagement) => engagement.type === "reaction"),
        primeiro_engajamento_em: engagementDates[0] ?? null,
        ultimo_engajamento_em: engagementDates.at(-1) ?? null,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: "post_id,pessoa_id,icp_id" })
      if (relationError) throw new Error(`Falha ao preservar o vínculo público com o post: ${relationError.message}`)

      for (const engagement of personEngagements) {
        if (engagement.type !== "comment" || !engagement.evidence || !engagement.occurredAt) continue
        const source = sourceByEngagement.get(`${engagement.type}:${engagement.externalId}`)
        const uniqueUrn = `intent:${await fingerprint(`comment:${engagement.externalId}`)}`
        const { data: candidateSignal, error: signalError } = await admin.from("sinais_candidatos_privados").upsert({
          projeto_id: job.projeto_id,
          pessoa_id: personId,
          empresa_id: companyId,
          post_id: postId,
          icp_id: icp.id,
          tipo: "comentou_tema",
          urn_unico: uniqueUrn,
          evidencia: engagement.evidence,
          contexto: post.texto,
          post_url: post.linkedin_url,
          ocorrido_em: engagement.occurredAt,
          provider: source?.actor ?? "apify",
          provider_run_id: source?.runId ?? null,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: "projeto_id,urn_unico" }).select("id,status").single()
        if (signalError || !candidateSignal) throw new Error(`Falha ao preparar comentário do post para julgamento: ${signalError?.message ?? "sinal ausente"}`)
        if (candidateSignal.status === "pendente") {
          const pending = pendingByPerson.get(personId) ?? []
          pending.push(candidateSignal.id)
          pendingByPerson.set(personId, pending)
        }
      }
    }

    for (const [personId, candidateIds] of pendingByPerson) {
      await enqueue(admin, job.projeto_id, "julgar_sinal", buildPersonJudgmentPayload(personId, candidateIds, job.id), 20)
    }

    const completedAt = new Date().toISOString()
    const { error: completeError } = await admin.from("post_operacao_privada").update({
      expansao_status: "concluida",
      comentarios_lidos: engagements.filter((item) => item.type === "comment").length,
      reacoes_lidas: engagements.filter((item) => item.type === "reaction").length,
      pessoas_avaliadas: evaluated,
      pessoas_aceitas: accepted,
      pessoas_novas: inserted,
      fontes: runs.map((run) => ({ actor: run.result.actor, run_id: run.result.runId, fallback: run.fallback, state: run.state })),
      expandido_em: completedAt,
      ultimo_erro: null,
      atualizado_em: completedAt,
    }).eq("post_id", postId).eq("icp_id", icp.id).eq("projeto_id", job.projeto_id)
    if (completeError) throw new Error(`Falha ao concluir a expansão do post: ${completeError.message}`)

    if (accepted > 0) {
      await enqueue(admin, job.projeto_id, "investigar_autor", { post_id: postId, icp_id: icp.id }, 36)
    }

    await finishExecution(admin, executionId, { status: "concluida", costUsd: totalCost, people: inserted })
    return {
      comments: engagements.filter((item) => item.type === "comment").length,
      reactions: engagements.filter((item) => item.type === "reaction").length,
      evaluated,
      accepted,
      inserted,
      judgmentsQueued: pendingByPerson.size,
      costUsd: totalCost,
    }
  } catch (error) {
    await admin.from("post_operacao_privada").upsert({
      post_id: postId,
      icp_id: icpId,
      projeto_id: job.projeto_id,
      expansao_status: "falhou",
      ultimo_erro: errorMessage(error),
      atualizado_em: new Date().toISOString(),
    }, { onConflict: "post_id,icp_id" })
    await finishExecution(admin, executionId, { status: "falhou", costUsd: totalCost, people: inserted, error: errorMessage(error) })
    throw error
  }
}

async function processAuthorInvestigationJob(admin: AdminClient, job: Job) {
  const postId = typeof job.payload.post_id === "string" ? job.payload.post_id : ""
  const icpId = typeof job.payload.icp_id === "string" ? job.payload.icp_id : ""
  const executionId = await createExecution(admin, job.projeto_id, "cascata", {
    job_id: job.id,
    post_id: postId,
    icp_id: icpId,
    origem: "autor",
  })

  try {
    const { data: triggerPost, error: triggerError } = await admin.from("posts")
      .select("id, autor_nome, autor_url, texto")
      .eq("id", postId)
      .eq("projeto_id", job.projeto_id)
      .maybeSingle()
    if (triggerError || !triggerPost) throw new Error("O post de origem não foi encontrado para avaliar o autor.")

    const rawAuthorUrl = typeof triggerPost.autor_url === "string" ? triggerPost.autor_url : ""
    const authorSlug = normalizeProfileSlug(rawAuthorUrl)
    const authorName = usablePersonName(triggerPost.autor_nome)
    if (!authorSlug || !authorName || !rawAuthorUrl.includes("linkedin.com/in/")) {
      await finishExecution(admin, executionId, { status: "concluida" })
      return { suggested: false, reason: "author_identity_unavailable" }
    }
    const authorUrl = canonicalProfileUrl(rawAuthorUrl)

    const { data: projectPosts, error: postsError } = await admin.from("posts")
      .select("id, autor_url")
      .eq("projeto_id", job.projeto_id)
      .not("autor_url", "is", null)
    if (postsError) throw new Error(`Falha ao reunir o histórico público do autor: ${postsError.message}`)
    const authorPostIds = (projectPosts ?? [])
      .filter((post) => typeof post.autor_url === "string" && normalizeProfileSlug(post.autor_url) === authorSlug)
      .map((post) => post.id)
    if (!authorPostIds.length) {
      await finishExecution(admin, executionId, { status: "concluida" })
      return { suggested: false, reason: "no_qualified_posts" }
    }

    const { data: relations, error: relationsError } = await admin.from("post_engajadores_privados")
      .select("post_id, pessoa_id, comentou, reagiu")
      .eq("projeto_id", job.projeto_id)
      .eq("icp_id", icpId)
      .in("post_id", authorPostIds)
    if (relationsError) throw new Error(`Falha ao avaliar as conversas ligadas ao autor: ${relationsError.message}`)

    const personIds = (relations ?? []).map((relation) => relation.pessoa_id)
    if (!qualifiesAuthorForWatchlist(personIds)) {
      await finishExecution(admin, executionId, { status: "concluida" })
      return { suggested: false, people: new Set(personIds).size }
    }

    const meta = JSON.stringify({
      posts: new Set((relations ?? []).map((relation) => relation.post_id)).size,
      comentarios: (relations ?? []).filter((relation) => relation.comentou).length,
      reacoes: (relations ?? []).filter((relation) => relation.reagiu).length,
      pessoas: new Set(personIds).size,
      icp: new Set(personIds).size,
      pre_visualizacao_post: triggerPost.texto,
      motivo: "Este perfil reúne conversas com pessoas alinhadas ao seu público.",
    })

    const { data: sources, error: sourcesError } = await admin.from("fontes")
      .select("id, linkedin_url, status")
      .eq("projeto_id", job.projeto_id)
    if (sourcesError) throw new Error(`Falha ao verificar sugestões existentes: ${sourcesError.message}`)
    const existing = (sources ?? []).find((source) => normalizeProfileSlug(source.linkedin_url) === authorSlug)
    let sourceId: string
    let status = existing?.status ?? "candidata"
    if (existing) {
      sourceId = existing.id
      const { error: updateError } = await admin.from("fontes").update({
        tipo_watchlist: "pessoa",
        nome: authorName,
        meta,
        descoberta_em: "motor_intent",
      }).eq("id", existing.id).eq("projeto_id", job.projeto_id)
      if (updateError) throw new Error(`Falha ao atualizar a sugestão do autor: ${updateError.message}`)
    } else {
      const { data: source, error: insertError } = await admin.from("fontes").insert({
        projeto_id: job.projeto_id,
        tipo: "perfil",
        tipo_watchlist: "pessoa",
        linkedin_url: authorUrl,
        nome: authorName,
        meta,
        status: "candidata",
        descoberta_em: "motor_intent",
      }).select("id").single()
      if (insertError || !source) throw new Error(`Falha ao criar a sugestão do autor: ${insertError?.message ?? "registro ausente"}`)
      sourceId = source.id
      status = "candidata"
    }

    await finishExecution(admin, executionId, { status: "concluida" })
    return { suggested: status !== "descartada", sourceId, status, people: new Set(personIds).size }
  } catch (error) {
    await finishExecution(admin, executionId, { status: "falhou", error: errorMessage(error) })
    throw error
  }
}

async function refreshCompanyLevel(admin: AdminClient, projectId: string, companyId: string) {
  const { count, error } = await admin.from("pessoas").select("id", { count: "exact", head: true })
    .eq("projeto_id", projectId).eq("empresa_id", companyId).in("status", ["lead", "sinal_fraco", "cliente"])
  if (error) throw new Error(`Falha ao recalcular conta: ${error.message}`)
  const people = count ?? 0
  await admin.from("empresas").update({
    pessoas_com_sinal: people,
    nivel: people >= 2 ? "em_movimento" : people === 1 ? "aquecendo" : "fria",
  }).eq("id", companyId)
}

async function processJudgeSignalJob(admin: AdminClient, job: Job, openAiKey: string) {
  const legacyCandidateId = typeof job.payload.candidato_id === "string" ? job.payload.candidato_id : ""
  const candidateIds = Array.isArray(job.payload.candidato_ids)
    ? [...new Set(job.payload.candidato_ids.filter((value): value is string => typeof value === "string" && value.length > 0))]
    : legacyCandidateId ? [legacyCandidateId] : []
  const payloadPersonId = typeof job.payload.pessoa_id === "string" ? job.payload.pessoa_id : ""
  const watchJobId = typeof job.payload.vigilia_job_id === "string" ? job.payload.vigilia_job_id : job.id
  const executionId = await createExecution(admin, job.projeto_id, "julgamento", {
    job_id: job.id,
    pessoa_id: payloadPersonId || null,
    candidatos: candidateIds.length,
    vigilia_job_id: watchJobId,
  })
  let totalCost = 0
  try {
    if (!candidateIds.length) throw new Error("Nenhuma atividade foi preparada para avaliação.")
    const { data: candidates, error: candidateError } = await admin.from("sinais_candidatos_privados")
      .select("*")
      .eq("projeto_id", job.projeto_id)
      .in("id", candidateIds)
    if (candidateError || candidates?.length !== candidateIds.length) throw new Error("As atividades pendentes não foram encontradas.")

    const personIds = [...new Set(candidates.map((candidate) => candidate.pessoa_id))]
    if (personIds.length !== 1 || payloadPersonId && personIds[0] !== payloadPersonId) {
      throw new Error("As atividades não pertencem à mesma pessoa observada.")
    }
    const personId = personIds[0]
    const creditReference = personJudgmentCreditReference(personId, watchJobId)
    const pendingCandidates = candidates.filter((candidate) => candidate.status === "pendente")
    if (!pendingCandidates.length) {
      if (candidates.some((candidate) => candidate.status === "aprovado")) {
        const { error: settleError } = await admin.rpc("intent_settle_job_credits", {
          target_job_id: job.id,
          target_reference: creditReference,
          target_consume: true,
        })
        if (settleError) throw new Error(`Falha ao confirmar consumo de crédito: ${settleError.message}`)
      }
      await finishExecution(admin, executionId, { status: "concluida" })
      return { alreadyProcessed: true, candidates: candidates.length }
    }

    const { data: operation } = await admin.from("pessoa_operacao_privada")
      .select("fit, excluido, empresa_candidata")
      .eq("pessoa_id", personId)
      .maybeSingle()
    if (!operation || operation.excluido || Number(operation.fit ?? 0) < 60) {
      await admin.from("sinais_candidatos_privados").update({
        status: "rejeitado",
        motivo_rejeicao: "Fora dos critérios privados de aderência.",
        atualizado_em: new Date().toISOString(),
      }).in("id", pendingCandidates.map((candidate) => candidate.id))
      await finishExecution(admin, executionId, { status: "concluida" })
      return { rejected: true, candidates: pendingCandidates.length }
    }

    const icpIds = [...new Set(pendingCandidates.map((candidate) => candidate.icp_id))]
    if (icpIds.length !== 1) throw new Error("As atividades não usam o mesmo perfil ideal.")
    const { data: icp } = await admin.from("icps").select("id, sinais_de_compra").eq("id", icpIds[0]).eq("status", "ativo").maybeSingle()
    if (!icp) throw new Error("O perfil ideal usado neste sinal não está mais ativo.")

    const { data: hasCredits, error: reserveError } = await admin.rpc("intent_reserve_job_credits", {
      target_job_id: job.id,
      target_event: "pessoa_julgada",
      target_amount: 1,
      target_reference: creditReference,
    })
    if (reserveError) throw new Error(`Falha ao reservar crédito: ${reserveError.message}`)
    if (!hasCredits) {
      await finishExecution(admin, executionId, { status: "aguardando_creditos" })
      return { waitingForCredits: true }
    }
    const rules = signalRules(icp.sinais_de_compra)
    let companyId: string | null = null
    let companyResolved = false
    let strongestStatus = "sinal_fraco"

    for (const candidate of pendingCandidates) {
      const result = await judgePublicSignal({
        apiKey: openAiKey,
        evidence: candidate.evidencia,
        context: candidate.contexto,
        ruleDefinitions: rules,
      })
      totalCost += result.costUsd

      if (!companyResolved) {
        companyId = await materializeCompany(admin, job.projeto_id, personId, operation.empresa_candidata)
        companyResolved = true
      }

      const { data: signal, error: signalError } = await admin.from("sinais").upsert({
        projeto_id: job.projeto_id,
        pessoa_id: candidate.pessoa_id,
        empresa_id: companyId,
        post_id: candidate.post_id,
        icp_id: candidate.icp_id,
        tipo: candidate.tipo,
        urn_unico: candidate.urn_unico,
        evidencia: candidate.evidencia,
        contexto: candidate.contexto,
        nota: result.judgment.nota,
        regra_que_bateu: result.judgment.regra_que_bateu,
        ocorrido_em: candidate.ocorrido_em,
      }, { onConflict: "projeto_id,urn_unico" }).select("id").single()
      if (signalError || !signal) throw new Error(`Falha ao publicar sinal aprovado: ${signalError?.message ?? "sinal ausente"}`)

      const { error: auditError } = await admin.from("sinal_julgamentos_privados").upsert({
        sinal_id: signal.id,
        projeto_id: job.projeto_id,
        resposta: result.judgment,
        modelo: result.model,
        prompt_versao: "intent_signal_judgment_v1",
        custo_usd: result.costUsd,
        latencia_ms: result.durationMs,
      }, { onConflict: "sinal_id" })
      if (auditError) throw new Error(`Falha ao registrar auditoria do julgamento: ${auditError.message}`)

      const personStatus = result.judgment.nota >= 80 ? "lead" : "sinal_fraco"
      if (personStatus === "lead") strongestStatus = "lead"
      const { data: currentPerson } = await admin.from("pessoas").select("intencao, status, ultimo_sinal_em").eq("id", candidate.pessoa_id).maybeSingle()
      const currentIntent = Number(currentPerson?.intencao ?? -1)
      const preserveClient = currentPerson?.status === "cliente"
      await admin.from("pessoas").update({
        status: preserveClient ? "cliente" : result.judgment.nota >= currentIntent ? personStatus : currentPerson?.status,
        intencao: Math.max(currentIntent, result.judgment.nota),
        ultimo_sinal_em: !currentPerson?.ultimo_sinal_em || new Date(candidate.ocorrido_em) > new Date(currentPerson.ultimo_sinal_em) ? candidate.ocorrido_em : currentPerson.ultimo_sinal_em,
      }).eq("id", candidate.pessoa_id)

      await admin.from("sinais_candidatos_privados").update({
        status: "aprovado",
        empresa_id: companyId,
        atualizado_em: new Date().toISOString(),
      }).eq("id", candidate.id)

      await admin.from("custos").insert({
        execucao_id: executionId,
        actor: result.model,
        provider: "openai",
        operacao: "judge_signal",
        external_run_id: result.requestId,
        latencia_ms: result.durationMs,
        itens: 1,
        custo_usd: result.costUsd,
      })
    }

    const { error: settleError } = await admin.rpc("intent_settle_job_credits", { target_job_id: job.id, target_reference: creditReference, target_consume: true })
    if (settleError) throw new Error(`Falha ao confirmar consumo de crédito: ${settleError.message}`)
    if (companyId) {
      await refreshCompanyLevel(admin, job.projeto_id, companyId)
      const { data: expandableCompany } = await admin.from("empresa_operacao_privada")
        .select("empresa_id")
        .eq("empresa_id", companyId)
        .eq("projeto_id", job.projeto_id)
        .maybeSingle()
      if (expandableCompany) {
        await enqueue(admin, job.projeto_id, "varrer_empresa", { empresa_id: companyId, icp_id: icp.id }, 30)
      }
    }
    const qualifiedPostIds = [...new Set(pendingCandidates.flatMap((candidate) => typeof candidate.post_id === "string" ? [candidate.post_id] : []))]
    for (const qualifiedPostId of qualifiedPostIds) {
      await enqueue(admin, job.projeto_id, "varrer_post", { post_id: qualifiedPostId, icp_id: icp.id }, 35)
    }
    await finishExecution(admin, executionId, { status: "concluida", costUsd: totalCost })
    return { candidates: pendingCandidates.length, status: strongestStatus, costUsd: totalCost }
  } catch (error) {
    await finishExecution(admin, executionId, { status: "falhou", costUsd: totalCost, error: errorMessage(error) })
    throw error
  }
}

async function processJob(admin: AdminClient, job: Job, secrets: { apollo: string; apify: string; openai: string }) {
  if (job.tipo === "semear_radar") return processSeedJob(admin, job, secrets.apollo)
  if (job.tipo === "vigiar_pessoa") return processWatchPersonJob(admin, job, secrets.apify)
  if (job.tipo === "julgar_sinal") return processJudgeSignalJob(admin, job, secrets.openai)
  if (job.tipo === "varrer_empresa") return processCompanyCascadeJob(admin, job, secrets.apollo)
  if (job.tipo === "varrer_post") return processPostCascadeJob(admin, job, { apollo: secrets.apollo, apify: secrets.apify })
  if (job.tipo === "investigar_autor") return processAuthorInvestigationJob(admin, job)
  throw new Error("Este tipo de etapa ainda não pertence ao fluxo ativo da Fase 2.")
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const schedulerSecret = Deno.env.get("SCHEDULER_SECRET")
  const apollo = Deno.env.get("APOLLO_API_KEY")
  const apify = Deno.env.get("APIFY_TOKEN")
  const openai = Deno.env.get("OPENAI_API_KEY")
  if (!supabaseUrl || !serviceRoleKey || !apollo || !apify || !openai) return json({ error: "A descoberta está temporariamente indisponível." }, 503)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  let body: { projectId?: string; maxJobs?: number; jobTypes?: string[] }
  try { body = await request.json() } catch { return json({ error: "Não conseguimos entender esta solicitação." }, 400) }

  const calledByScheduler = Boolean(schedulerSecret && request.headers.get("x-scheduler-secret") === schedulerSecret)
  let projectId = typeof body.projectId === "string" ? body.projectId : null
  if (!calledByScheduler) {
    const authHeader = request.headers.get("Authorization")
    if (!authHeader || !projectId) return json({ error: "Entre na sua conta para continuar." }, 401)
    const userClient = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: "Sua sessão expirou. Entre novamente." }, 401)
    const { data: owned } = await admin.from("projetos").select("id").eq("id", projectId).eq("owner_id", user.id).maybeSingle()
    if (!owned) return json({ error: "Não encontramos esta empresa na sua conta." }, 404)
  }

  const activeTypes = ["semear_radar", "vigiar_pessoa", "julgar_sinal", "varrer_empresa", "varrer_post", "investigar_autor"]
  const requestedTypes = Array.isArray(body.jobTypes) ? body.jobTypes.filter((type) => activeTypes.includes(type)) : activeTypes
  const maxJobs = Math.max(1, Math.min(10, Math.trunc(Number(body.maxJobs ?? 5))))
  const processed: Array<Record<string, unknown>> = []

  const { error: resumeError } = await admin.rpc("intent_resume_waiting_credit_jobs", {
    target_project_id: projectId,
  })
  if (resumeError) return json({ error: "Não foi possível preparar a retomada das análises." }, 500)

  for (let index = 0; index < maxJobs; index += 1) {
    const { data: jobs, error: claimError } = await admin.rpc("intent_claim_jobs", {
      target_types: requestedTypes,
      target_project_id: projectId,
      target_limit: 1,
      lease_seconds: 240,
    })
    if (claimError) return json({ error: "Não foi possível preparar a próxima etapa.", detail: claimError.message }, 500)
    const job = Array.isArray(jobs) ? jobs[0] as Job | undefined : undefined
    if (!job) break

    try {
      const budgetUnits = engineBudgetUnits(job.tipo)
      if (budgetUnits > 0) {
        const { data: budgetStatus, error: budgetError } = await admin.rpc("intent_reserve_engine_budget", {
          target_job_id: job.id,
          target_attempt: job.tentativas,
          target_units: budgetUnits,
        })
        if (budgetError) throw new Error(`Não foi possível confirmar o orçamento desta análise: ${budgetError.message}`)
        if (budgetStatus !== "reservado") {
          processed.push({ jobId: job.id, type: job.tipo, status: budgetStatus })
          continue
        }
      }
      const result = await processJob(admin, job, { apollo, apify, openai })
      if (!(result && typeof result === "object" && "waitingForCredits" in result)) {
        const { data: completed } = await admin.rpc("intent_complete_job", { target_job_id: job.id, target_lease_token: job.lease_token })
        if (!completed) throw new Error("A etapa perdeu a reserva antes de concluir.")
      }
      processed.push({ jobId: job.id, type: job.tipo, status: "completed", result })
    } catch (error) {
      const retryDelay = error instanceof ApolloRequestError ? error.retryAfterSeconds ?? 60 : Math.min(900, 30 * 2 ** Math.max(0, job.tentativas - 1))
      const { data: nextStatus } = await admin.rpc("intent_fail_job", {
        target_job_id: job.id,
        target_lease_token: job.lease_token,
        target_error: errorMessage(error),
        retry_delay_seconds: retryDelay,
      })
      processed.push({ jobId: job.id, type: job.tipo, status: nextStatus ?? "failed", error: errorMessage(error) })
    }
  }

  return json({ processed, projectId, hasMore: processed.length === maxJobs })
})
