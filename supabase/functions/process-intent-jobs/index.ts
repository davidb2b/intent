import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { runApifyActor, type ApifyRunResult } from "../_shared/apify-client.ts"
import { searchApolloPeople, enrichApolloPerson, ApolloRequestError } from "../_shared/apollo-client.ts"
import {
  apolloSearchPersonIds,
  assessApolloFit,
  buildApolloCompanyPeopleSearchInput,
  buildPersonJudgmentPayload,
  buildApolloPeopleSearchInput,
  candidateBelongsToCompany,
  normalizeEnrichedApolloPerson,
  personJudgmentCreditReference,
  stripApolloContactFields,
  type ApolloSeedCandidate,
  type BuyerProfile,
  type FitAssessment,
} from "../_shared/intent-phase2-domain.ts"
import { dedupeActivities, normalizeProfileActivityItem, type NormalizedActivity } from "../_shared/intent-activity.ts"
import { judgePublicSignal } from "../_shared/intent-signal-llm.ts"
import { normalizeCompanyKey } from "../_shared/person-enrichment.ts"
import { normalizeProfileSlug, profileUsername } from "../_shared/profile-identity.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-scheduler-secret",
}

const PRIMARY_ACTORS = {
  comment: "harvestapi/linkedin-profile-comments",
  reaction: "harvestapi/linkedin-profile-reactions",
} as const
const FALLBACK_ACTOR = "scraping_solutions/linkedin-profile-comments-reactions-scraper-no-cookies"
const RAW_RETENTION_DAYS = 7
const DEFAULT_SEED_SIZE = 5
const DEFAULT_COMPANY_EXPANSION_SIZE = 5

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

type RadarOrigin = "semente_apollo" | "cascata_empresa"

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
      const { personId, inserted: wasInserted } = await upsertRadarPerson(admin, {
        projectId: job.projeto_id,
        candidate,
        fit,
        origin: "semente_apollo",
      })
      if (wasInserted) inserted += 1

      if (!fit.excluded && fit.score >= 60) {
        await enqueue(admin, job.projeto_id, "vigiar_pessoa", { pessoa_id: personId, icp_id: icp.id }, 40)
      }
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
  if (logs.includes("no valid source provided") || logs.includes("profile not found") || logs.includes("profile unavailable")) return "profile_unavailable" as const
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
      const radar = await upsertRadarPerson(admin, {
        projectId: job.projeto_id,
        candidate,
        fit,
        origin: "cascata_empresa",
        companyId,
      })
      if (radar.inserted) inserted += 1
      if (!fit.excluded && fit.score >= 60) {
        accepted += 1
        await enqueue(admin, job.projeto_id, "vigiar_pessoa", { pessoa_id: radar.personId, icp_id: icp.id }, 40)
      }
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

  const activeTypes = ["semear_radar", "vigiar_pessoa", "julgar_sinal", "varrer_empresa"]
  const requestedTypes = Array.isArray(body.jobTypes) ? body.jobTypes.filter((type) => activeTypes.includes(type)) : activeTypes
  const maxJobs = Math.max(1, Math.min(10, Math.trunc(Number(body.maxJobs ?? 5))))
  const processed: Array<Record<string, unknown>> = []

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
