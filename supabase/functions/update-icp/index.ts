import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { validateBuyerProfile, validateBuyingSignals } from "../_shared/intent-onboarding-llm.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function nonEmptyStrings(value: unknown, min: number, max: number, label: string): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(`${label} fora do limite permitido.`)
  const parsed = value.map((item) => typeof item === "string" ? item.trim() : "")
  if (parsed.some((item) => !item)) throw new Error(`${label} contém item vazio.`)
  if (new Set(parsed).size !== parsed.length) throw new Error(`${label} contém itens duplicados.`)
  return parsed
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const authHeader = request.headers.get("Authorization")
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Backend não configurado." }, 503)
  if (!authHeader) return json({ error: "Faça login para editar o ICP." }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const userClient = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: "Sessão inválida. Faça login novamente." }, 401)

  let body: {
    icpId?: string
    companySummary?: string
    solvedPains?: unknown
    buyer?: Record<string, unknown>
    buyingSignals?: Record<string, unknown>
  }
  try { body = await request.json() } catch { return json({ error: "JSON inválido." }, 400) }
  if (!body.icpId) return json({ error: "icpId é obrigatório." }, 400)

  const { data: icp } = await admin.from("icps").select("id, projeto_id, status, firmografia").eq("id", body.icpId).maybeSingle()
  if (!icp) return json({ error: "ICP não encontrado." }, 404)
  const { data: project } = await admin.from("projetos").select("id").eq("id", icp.projeto_id).eq("owner_id", user.id).maybeSingle()
  if (!project) return json({ error: "ICP não pertence a este usuário." }, 403)
  if (icp.status !== "rascunho") return json({ error: "Somente um ICP em rascunho pode ser editado." }, 409)

  try {
    const companySummary = body.companySummary?.trim()
    if (!companySummary) throw new Error("O resumo da empresa é obrigatório.")
    const solvedPains = nonEmptyStrings(body.solvedPains, 1, 8, "Dores resolvidas")
    if (!body.buyer || !body.buyingSignals) throw new Error("Comprador e sinais de compra são obrigatórios.")
    validateBuyerProfile(body.buyer)
    validateBuyingSignals(body.buyingSignals)

    const currentCompany = icp.firmografia && typeof icp.firmografia === "object" ? icp.firmografia as Record<string, unknown> : {}
    const company = { ...currentCompany, empresa_resumo: companySummary, dores_resolvidas: solvedPains }
    const { error } = await admin.from("icps").update({
      empresa_resumo: companySummary,
      firmografia: company,
      comprador: body.buyer,
      sinais_de_compra: body.buyingSignals,
      atualizado_em: new Date().toISOString(),
    }).eq("id", icp.id).eq("status", "rascunho")
    if (error) throw error
    return json({ status: "saved", icpId: icp.id })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Não foi possível salvar o ICP." }, 400)
  }
})

