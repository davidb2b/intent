import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  generateIntentV2Buyer,
  generateIntentV2Company,
  generateIntentV2Signals,
} from "../_shared/intent-v2-generation.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}
const PROMPT_VERSION = "intent-v2-ia1-2026-08-22"
const MAX_EVIDENCE_CHARS = 100_000

type Body = { projectId?: string; icpId?: string }
type EvidenceSource = { provider: string; operation: string; payload: unknown }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : ""
  if (/contrato|quantidade|repetir|confirmad|JSON/i.test(message)) return "Não conseguimos organizar as evidências desta empresa com segurança. Revise a descoberta e tente novamente."
  if (/timeout|tempo.*esgot/i.test(message)) return "A organização das evidências demorou mais que o esperado. Seus dados estão preservados; tente novamente em instantes."
  if (/API|chave|IA|OpenAI|geração/i.test(message)) return "A análise inteligente está indisponível neste momento. Seus dados estão preservados; tente novamente mais tarde."
  return "Não conseguimos concluir esta organização agora. Seus dados estão preservados; tente novamente em instantes."
}

function asEvidence(value: unknown): EvidenceSource[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    return typeof row.provider === "string" && typeof row.operacao === "string" ? [{ provider: row.provider, operation: row.operacao, payload: row.payload }] : []
  })
}

function boundedEvidence(sources: EvidenceSource[]): string {
  const text = sources.map((source) => `ORIGEM: ${source.provider}/${source.operation}\n${JSON.stringify(source.payload)}`).join("\n\n")
  return text.slice(0, MAX_EVIDENCE_CHARS)
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const openAiApiKey = Deno.env.get("OPENAI_API_KEY")
  if (!supabaseUrl || !serviceRoleKey || !openAiApiKey) return json({ error: "A organização inteligente ainda não está disponível para esta conta. Tente novamente mais tarde." }, 503)

  const authHeader = request.headers.get("Authorization")
  if (!authHeader) return json({ error: "Entre na sua conta para continuar." }, 401)
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const userClient = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: "Sua sessão expirou. Entre novamente para continuar." }, 401)

  let body: Body
  try { body = await request.json() } catch { return json({ error: "Não conseguimos entender esta solicitação. Atualize a página e tente novamente." }, 400) }
  if (!body.projectId || !body.icpId) return json({ error: "Não encontramos a versão da empresa para organizar. Atualize a página e tente novamente." }, 400)

  const { data: project } = await admin.from("projetos").select("id").eq("id", body.projectId).eq("owner_id", user.id).maybeSingle()
  if (!project) return json({ error: "Não encontramos sua empresa nesta conta. Atualize a página e tente novamente." }, 404)
  const { data: icp } = await admin.from("intent_v2_icps").select("id,empresa,comprador,sinais_de_compra").eq("id", body.icpId).eq("projeto_id", project.id).eq("criado_por", user.id).maybeSingle()
  if (!icp) return json({ error: "Não encontramos esta versão da empresa. Atualize a página e tente novamente." }, 404)

  // Stops before the paid AI chain if the audit migration has not reached this
  // project yet. A partial rollout must never generate a cost without the
  // complete execution trail required by the product contract.
  const { error: auditSchemaError } = await admin
    .from("intent_v2_icps")
    .select("geracao_execucao_id")
    .eq("id", icp.id)
    .limit(1)
  if (auditSchemaError) {
    console.error("Intent v2 generation audit schema unavailable", auditSchemaError)
    return json({
      error: "Estamos concluindo uma atualização de segurança desta etapa. Tente organizar o perfil novamente em alguns minutos.",
    }, 503)
  }

  const { data: execution, error: executionError } = await admin.from("execucoes").insert({
    projeto_id: project.id, tipo: "onboarding", status: "rodando", etapa_atual: "ia1a", progresso: 10,
    mensagem_progresso: "Organizando o contexto confirmado da empresa.",
    parametros: { phase: "intent-v2-phase-3", icp_v2_id: icp.id, prompt_version: PROMPT_VERSION, providers: ["site", "apollo", "linkedin"] },
  }).select("id").single()
  if (executionError || !execution) {
    const conflict = executionError?.code === "23505"
    return json({ error: conflict ? "Já existe uma organização em andamento. Aguarde a conclusão antes de iniciar outra." : "Não foi possível iniciar esta organização agora. Tente novamente em alguns instantes." }, conflict ? 409 : 500)
  }

  let totalCostUsd = 0
  const recordCost = async (result: { model: string; requestId: string | null; durationMs: number; costUsd: number; usage: { inputTokens: number; outputTokens: number } }, operation: string) => {
    totalCostUsd += result.costUsd
    await admin.from("custos").insert({ execucao_id: execution.id, actor: result.model, provider: "openai", operacao: operation, external_run_id: result.requestId, latencia_ms: result.durationMs, itens: result.usage.inputTokens + result.usage.outputTokens, custo_usd: result.costUsd })
  }
  const progress = (stage: string, percentage: number, message: string) => admin.from("execucoes").update({ etapa_atual: stage, progresso: percentage, mensagem_progresso: message }).eq("id", execution.id)

  try {
    const { data: rawRows } = await admin.from("integracao_raw_payloads").select("provider,operacao,payload").eq("projeto_id", project.id).in("operacao", ["intent_v2_site", "intent_v2_organization", "intent_v2_linkedin_company"])
    const sources = asEvidence(rawRows)
    if (!sources.some((source) => source.operation === "intent_v2_site")) throw new Error("Não há evidência pública do site para esta versão.")

    const company = await generateIntentV2Company(openAiApiKey, boundedEvidence(sources))
    await recordCost(company.result, "intent_v2_ia1a_company")
    await progress("ia1b", 45, "Definindo quem tem potencial de compra a partir das dores confirmadas.")
    const buyer = await generateIntentV2Buyer(openAiApiKey, company.value.dores_resolvidas)
    await recordCost(buyer.result, "intent_v2_ia1b_buyer")
    await progress("ia1c", 72, "Organizando os sinais de compra que merecem acompanhamento.")
    const signals = await generateIntentV2Signals(openAiApiKey, { empresa: company.value, comprador: buyer.value })
    await recordCost(signals.result, "intent_v2_ia1c_signals")

    const currentCompany = icp.empresa && typeof icp.empresa === "object" ? icp.empresa as Record<string, unknown> : {}
    const currentSources = Array.isArray(currentCompany.fontes) ? currentCompany.fontes : []
    const updatedCompany = {
      ...currentCompany,
      nome: company.value.firmografia.nome ?? currentCompany.nome ?? null,
      resumo: company.value.resumo,
      setor: company.value.firmografia.setor ?? currentCompany.setor ?? null,
      porte: company.value.firmografia.funcionarios ? String(company.value.firmografia.funcionarios) : currentCompany.porte ?? null,
      localizacao: company.value.firmografia.sede ?? currentCompany.localizacao ?? null,
      linkedinUrl: company.value.firmografia.linkedin_url ?? currentCompany.linkedinUrl ?? null,
      oferta: company.value.oferta,
      proposta_valor: company.value.proposta_valor,
      dores_resolvidas: company.value.dores_resolvidas,
      segmentos_atendidos: company.value.segmentos_atendidos,
      firmografia: company.value.firmografia,
      fontes: currentSources,
    }
    const generationCost = Number(totalCostUsd.toFixed(6))
    const { error: updateError } = await admin.from("intent_v2_icps").update({
      empresa: updatedCompany,
      comprador: { status: "gerado", cargos: buyer.value.cargos, setores: buyer.value.industrias, portes: buyer.value.tamanhos, localizacoes: ["Brasil"], fontes: currentSources },
      sinais_de_compra: { status: "gerado", dores: signals.value.dores, gatilhos: signals.value.gatilhos, termos: signals.value.termos, fontes: currentSources },
      geracao_execucao_id: execution.id, modelo_geracao: company.result.model, prompt_versao: PROMPT_VERSION, custo_geracao_usd: generationCost, gerado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
    }).eq("id", icp.id).eq("projeto_id", project.id)
    if (updateError) throw new Error("Não conseguimos salvar esta organização.")
    await progress("concluida", 100, "Perfil da empresa, perfil ideal e sinais de compra organizados para revisão.")
    await admin.from("execucoes").update({ status: "concluida", custo_usd: generationCost, concluida_em: new Date().toISOString() }).eq("id", execution.id)
    return json({ ok: true, icpV2Id: icp.id, executionId: execution.id, promptVersion: PROMPT_VERSION, costUsd: generationCost })
  } catch (error) {
    await admin.from("execucoes").update({ status: "falhou", erro: error instanceof Error ? error.message.slice(0, 1_000) : "Falha inesperada", concluida_em: new Date().toISOString(), custo_usd: Number(totalCostUsd.toFixed(6)), mensagem_progresso: "Não foi possível concluir esta organização agora." }).eq("id", execution.id)
    return json({ error: publicError(error) }, 500)
  }
})
