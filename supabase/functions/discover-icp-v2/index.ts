import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { enrichApolloOrganization, ApolloRequestError } from "../_shared/apollo-client.ts"
import { runApifyActor, type ApifyRunResult } from "../_shared/apify-client.ts"
import {
  extractLinkedInCompanyUrl,
  hasConfirmedFirmography,
  mergeV2CompanySources,
  normalizeApolloOrganization,
  normalizeLinkedInCompany,
  safeApolloOrganizationPayload,
  type IntentV2SitePage,
} from "../_shared/intent-v2-onboarding.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const SITE_ACTOR = "apify/website-content-crawler"
const COMPANY_ACTORS = ["harvestapi/linkedin-company", "sourabhbgp/linkedin-company-scraper"] as const
const CACHE_DAYS = 30

type Body = { projectId?: string; siteUrl?: string; regenerate?: boolean }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Falha inesperada na descoberta da empresa."
}

function publicErrorMessage(message: string) {
  if (/crédito|limite|quota|rate limit|saldo/i.test(message)) {
    return "O limite disponível para esta análise foi atingido. Seus dados estão preservados; tente novamente quando o saldo for renovado."
  }
  if (/timeout|timed out|tempo.*esgot/i.test(message)) {
    return "Esta etapa levou mais tempo que o esperado. Seus dados estão seguros; aguarde alguns instantes e tente novamente."
  }
  if (/apollo|provedor não respondeu|indisponível/i.test(message)) {
    return "Não conseguimos confirmar a empresa agora. Verifique o endereço informado e tente novamente em alguns instantes."
  }
  return "Não conseguimos concluir a descoberta agora. Seus dados estão seguros; tente novamente em alguns instantes."
}

function normalizedSiteUrl(value: string | undefined): URL {
  if (!value?.trim()) throw new Error("Informe o site da empresa.")
  const withProtocol = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`
  const url = new URL(withProtocol)
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Use um endereço HTTP ou HTTPS válido.")
  const hostname = url.hostname.toLowerCase()
  if (hostname === "localhost" || hostname.endsWith(".local") || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    throw new Error("O site precisa ser um domínio público.")
  }
  url.hash = ""
  url.search = ""
  return url
}

function sitePages(items: unknown[]): IntentV2SitePage[] {
  return items.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return []
    const item = raw as Record<string, unknown>
    const url = typeof item.url === "string" ? item.url : typeof item.loadedUrl === "string" ? item.loadedUrl : typeof item.canonicalUrl === "string" ? item.canonicalUrl : ""
    const content = typeof item.markdown === "string" ? item.markdown : typeof item.text === "string" ? item.text : typeof item.content === "string" ? item.content : ""
    return url && content.trim() ? [{ url, content: content.trim() }] : []
  })
}

async function fingerprint(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function domainFrom(site: URL) {
  return site.hostname.replace(/^www\./i, "").toLowerCase()
}

function actorPayload(items: unknown[]) {
  return { items }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const apifyToken = Deno.env.get("APIFY_TOKEN")
  const apolloApiKey = Deno.env.get("APOLLO_API_KEY")
  if (!supabaseUrl || !serviceRoleKey || !apifyToken || !apolloApiKey) {
    return json({ error: "A descoberta ainda não está disponível para esta conta. Tente novamente mais tarde." }, 503)
  }

  const authHeader = request.headers.get("Authorization")
  if (!authHeader) return json({ error: "Entre na sua conta para continuar." }, 401)
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const userClient = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: "Sua sessão expirou. Entre novamente para continuar." }, 401)

  let body: Body
  try { body = await request.json() } catch { return json({ error: "Não conseguimos entender esta solicitação. Atualize a página e tente novamente." }, 400) }

  let site: URL
  try { site = normalizedSiteUrl(body.siteUrl) } catch (error) { return json({ error: errorMessage(error) }, 400) }
  if (!body.projectId) return json({ error: "Não encontramos sua empresa para iniciar a descoberta. Atualize a página e tente novamente." }, 400)

  const { data: project } = await admin.from("projetos").select("id,nome,site_url").eq("id", body.projectId).eq("owner_id", user.id).maybeSingle()
  if (!project) return json({ error: "Não encontramos sua empresa nesta conta. Atualize a página e tente novamente." }, 404)

  const { data: previousIcps } = await admin.from("intent_v2_icps").select("versao").eq("projeto_id", project.id).order("versao", { ascending: false }).limit(1)
  const version = Number(previousIcps?.[0]?.versao ?? 0) + 1
  const { data: execution, error: executionError } = await admin.from("execucoes").insert({
    projeto_id: project.id,
    tipo: "onboarding",
    status: "rodando",
    etapa_atual: "site",
    progresso: 5,
    mensagem_progresso: `Lendo as informações públicas de ${site.hostname}.`,
    parametros: { phase: "intent-v2-phase-2", version, site_url: site.toString(), google_used: false, providers: ["site", "apollo", "linkedin"], regenerate: body.regenerate === true },
  }).select("id").single()
  if (executionError || !execution) {
    const conflict = executionError?.code === "23505"
    return json({ error: conflict ? "Já existe uma descoberta em andamento. Aguarde a conclusão antes de iniciar outra." : "Não foi possível iniciar a descoberta agora. Tente novamente em alguns instantes." }, conflict ? 409 : 500)
  }

  const creditReference = `onboarding-v2:${execution.id}`
  const warnings: string[] = []
  let reservedCredits = false
  let totalCostUsd = 0
  const progress = async (stage: string, percentage: number, message: string) => {
    await admin.from("execucoes").update({ etapa_atual: stage, progresso: percentage, mensagem_progresso: message }).eq("id", execution.id)
  }
  const recordCost = async (result: ApifyRunResult | { model: string; costUsd: number; durationMs: number; requestId: string | null }, operation: string, itemCount: number) => {
    totalCostUsd += result.costUsd
    await admin.from("custos").insert({
      execucao_id: execution.id,
      actor: "actor" in result ? result.actor : result.model,
      provider: "actor" in result ? "apify" : "apollo",
      operacao: operation,
      external_run_id: "actor" in result ? result.runId : result.requestId,
      latencia_ms: result.durationMs,
      itens: itemCount,
      custo_usd: result.costUsd,
    })
  }
  const cacheKey = async (operation: string) => fingerprint(`${project.id}:${domainFrom(site)}:${operation}:intent-v2-phase-2`)
  const reserveCredits = async () => {
    if (reservedCredits) return
    const { error: reserveError } = await admin.rpc("intent_reserve_onboarding_credits", {
      target_project_id: project.id,
      target_reference: creditReference,
      target_amount: 1,
    })
    if (reserveError) throw new Error(reserveError.message)
    reservedCredits = true
  }
  const readCache = async (provider: string, operation: string) => {
    const key = await cacheKey(operation)
    const { data } = await admin.from("integracao_raw_payloads").select("payload").eq("projeto_id", project.id).eq("provider", provider).eq("operacao", operation).eq("request_fingerprint", key).gt("expira_em", new Date().toISOString()).maybeSingle()
    return data?.payload as Record<string, unknown> | undefined
  }
  const writeCache = async (provider: string, operation: string, payload: Record<string, unknown>, externalRunId?: string | null) => {
    const key = await cacheKey(operation)
    await admin.from("integracao_raw_payloads").upsert({
      projeto_id: project.id,
      provider,
      operacao: operation,
      external_run_id: externalRunId ?? null,
      request_fingerprint: key,
      payload,
      expira_em: new Date(Date.now() + CACHE_DAYS * 86_400_000).toISOString(),
    }, { onConflict: "provider,operacao,request_fingerprint" })
  }

  try {
    await admin.from("projetos").update({ site_url: site.toString(), site_dominio: domainFrom(site), onboarding_status: "em_andamento", onboarding_aviso: null }).eq("id", project.id)

    await progress("site", 14, "Reunindo o contexto público da empresa pelo próprio site.")
    const cachedSite = await readCache("apify", "intent_v2_site")
    let siteItems = Array.isArray(cachedSite?.items) ? cachedSite.items : null
    if (!siteItems) {
      await reserveCredits()
      const result = await runApifyActor(SITE_ACTOR, { startUrls: [{ url: site.toString() }], crawlerType: "cheerio", maxCrawlPages: 12, useSitemaps: true, proxyConfiguration: { useApifyProxy: true } }, apifyToken)
      siteItems = result.items
      await recordCost(result, "intent_v2_site", siteItems.length)
      await writeCache("apify", "intent_v2_site", actorPayload(siteItems), result.runId)
    }
    let pages = sitePages(siteItems)
    if (pages.reduce((sum, page) => sum + page.content.length, 0) < 2_000) {
      await progress("site", 24, "Estamos concluindo a leitura do site para evitar uma descoberta incompleta.")
      try {
        await reserveCredits()
        const fallback = await runApifyActor(SITE_ACTOR, { startUrls: [{ url: site.toString() }], crawlerType: "playwright:firefox", maxCrawlPages: 12, useSitemaps: true, proxyConfiguration: { useApifyProxy: true } }, apifyToken)
        if (fallback.items.length) {
          pages = sitePages(fallback.items)
          siteItems = fallback.items
          await recordCost(fallback, "intent_v2_site_fallback", fallback.items.length)
          await writeCache("apify", "intent_v2_site", actorPayload(siteItems), fallback.runId)
        }
      } catch {
        warnings.push("A leitura detalhada do site ficou parcial; os dados confirmados continuarão preservados.")
      }
    }
    if (!pages.length) throw new Error("O site não retornou conteúdo público suficiente para confirmar a empresa.")

    const linkedInFromSite = extractLinkedInCompanyUrl(pages)
    const domain = domainFrom(site)
    await progress("apollo", 42, "Confirmando a empresa pelo domínio informado.")
    const cachedApollo = await readCache("apollo", "intent_v2_organization")
    let apollo = cachedApollo?.organization && typeof cachedApollo.organization === "object" ? normalizeApolloOrganization(cachedApollo) : null
    if (!hasConfirmedFirmography(apollo)) {
      await reserveCredits()
      const apolloResponse = await enrichApolloOrganization(domain, apolloApiKey)
      apollo = normalizeApolloOrganization(apolloResponse.payload)
      await recordCost({ model: "organizations/enrich", costUsd: 0, durationMs: apolloResponse.durationMs, requestId: apolloResponse.requestId }, "intent_v2_organization", 1)
      await writeCache("apollo", "intent_v2_organization", safeApolloOrganizationPayload(apolloResponse.payload), apolloResponse.requestId)
    }
    const linkedInUrl = linkedInFromSite ?? apollo?.linkedinUrl ?? null
    if (!linkedInUrl) warnings.push("Não encontramos uma página pública da empresa no LinkedIn; a firmografia ficará limitada ao site e ao domínio confirmado.")

    let linkedin: ReturnType<typeof normalizeLinkedInCompany> = null
    if (linkedInUrl) {
      await progress("linkedin", 62, "Confirmando a firmografia na página pública da empresa.")
      const cachedLinkedIn = await readCache("apify", "intent_v2_linkedin_company")
      const cachedItems = Array.isArray(cachedLinkedIn?.items) ? cachedLinkedIn.items : []
      if (cachedItems.length) linkedin = normalizeLinkedInCompany(cachedItems)
      if (!linkedin) {
        let lastError: unknown = null
        for (const actor of COMPANY_ACTORS) {
          try {
            await reserveCredits()
            const result = await runApifyActor(actor, { companies: [linkedInUrl] }, apifyToken)
            await recordCost(result, "intent_v2_linkedin_company", result.items.length)
            await writeCache("apify", "intent_v2_linkedin_company", actorPayload(result.items), result.runId)
            linkedin = normalizeLinkedInCompany(result.items)
            if (linkedin) break
          } catch (error) {
            lastError = error
          }
        }
        if (!linkedin) warnings.push(lastError ? "A página pública da empresa não respondeu completamente; os dados confirmados por outras fontes foram preservados." : "A página pública da empresa não trouxe dados firmográficos suficientes.")
      }
    }

    await progress("empresa", 82, "Organizando a primeira versão do contexto da empresa.")
    const discovery = mergeV2CompanySources({ siteUrl: site.toString(), sitePages: pages, apollo, linkedin, linkedinUrl: linkedInUrl })
    const { data: icp, error: icpError } = await admin.from("intent_v2_icps").insert({
      projeto_id: project.id,
      versao: version,
      status: "rascunho",
      site_url: site.toString(),
      empresa_linkedin_url: discovery.linkedinUrl,
      localizacoes: ["Brasil"],
      empresa: discovery,
      comprador: { status: "pendente", cargos: [], setores: [], portes: [], localizacoes: ["Brasil"], fontes: [] },
      sinais_de_compra: { status: "pendente", dores: [], gatilhos: [], termos: [], fontes: [] },
      execucao_origem_id: execution.id,
      criado_por: user.id,
    }).select("id,versao").single()
    if (icpError || !icp) throw new Error("Não foi possível salvar a descoberta da empresa.")

    if (reservedCredits) {
      const { error: consumeError } = await admin.rpc("intent_consume_onboarding_credits", { target_project_id: project.id, target_reference: creditReference })
      if (consumeError) {
        // The draft must never outlive a failed credit reconciliation. It can
        // be generated again from the retained provider cache without showing
        // the person a result that was not properly accounted for.
        await admin.from("intent_v2_icps").delete().eq("id", icp.id).eq("projeto_id", project.id)
        throw new Error("Não conseguimos confirmar o uso desta descoberta agora.")
      }
      reservedCredits = false
    }
    await admin.from("projetos").update({ linkedin_empresa_url: discovery.linkedinUrl, onboarding_status: "concluido", onboarding_aviso: warnings.length ? warnings.join(" ") : null }).eq("id", project.id)
    await admin.from("execucoes").update({ status: warnings.length ? "parcial" : "concluida", etapa_atual: "concluida", progresso: 100, mensagem_progresso: warnings.length ? `Versão ${version} pronta, com alguns pontos para revisar.` : `Versão ${version} pronta para a próxima etapa.`, custo_usd: totalCostUsd, concluida_em: new Date().toISOString() }).eq("id", execution.id)

    return json({ ok: true, projectId: project.id, icpV2Id: icp.id, version: icp.versao, providers: ["site", "apollo", "linkedin"], googleUsed: false, linkedinUrl: discovery.linkedinUrl, warnings, costUsd: Number(totalCostUsd.toFixed(6)) })
  } catch (error) {
    if (reservedCredits) await admin.rpc("intent_refund_onboarding_credits", { target_project_id: project.id, target_reference: creditReference })
    const message = errorMessage(error)
    await admin.from("projetos").update({ onboarding_status: "falhou", onboarding_aviso: message }).eq("id", project.id)
    await admin.from("execucoes").update({ status: "falhou", etapa_atual: "falhou", mensagem_progresso: message, erro: message, custo_usd: totalCostUsd, concluida_em: new Date().toISOString() }).eq("id", execution.id)
    const status = error instanceof ApolloRequestError && error.retryAfterSeconds ? 429 : 502
    return json({ error: publicErrorMessage(message), projectId: project.id, executionId: execution.id, retryAfterSeconds: error instanceof ApolloRequestError ? error.retryAfterSeconds : null }, status)
  }
})
