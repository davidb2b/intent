import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function sourceDomain(meta: string | null): string {
  if (!meta) return ""
  try { return String(JSON.parse(meta).domain ?? "").toLowerCase() } catch { return "" }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const authHeader = request.headers.get("Authorization")
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Backend não configurado." }, 503)
  if (!authHeader) return json({ error: "Faça login para ativar o ICP." }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const userClient = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: "Sessão inválida. Faça login novamente." }, 401)

  let body: { icpId?: string }
  try { body = await request.json() } catch { return json({ error: "JSON inválido." }, 400) }
  if (!body.icpId) return json({ error: "icpId é obrigatório." }, 400)

  const { data: icp } = await admin.from("icps").select("id, projeto_id, versao, status, sinais_de_compra").eq("id", body.icpId).maybeSingle()
  if (!icp) return json({ error: "ICP não encontrado." }, 404)
  const { data: project } = await admin.from("projetos").select("id").eq("id", icp.projeto_id).eq("owner_id", user.id).maybeSingle()
  if (!project) return json({ error: "ICP não pertence a este usuário." }, 403)

  const { data: version, error: activationError } = await admin.rpc("intent_activate_icp", {
    target_project_id: project.id,
    target_icp_id: icp.id,
  })
  if (activationError) return json({ error: activationError.message }, 409)

  const signals = icp.sinais_de_compra && typeof icp.sinais_de_compra === "object" ? icp.sinais_de_compra as Record<string, unknown> : {}
  const competitors = Array.isArray(signals.concorrentes) ? signals.concorrentes as Array<Record<string, unknown>> : []
  const competitorDomains = new Set(competitors.map((item) => String(item.dominio ?? "").toLowerCase()).filter(Boolean))
  const { data: candidates } = await admin.from("fontes").select("id, meta").eq("projeto_id", project.id).eq("tipo_watchlist", "pagina").eq("status", "candidata")
  const approvedIds = (candidates ?? []).filter((source) => competitorDomains.has(sourceDomain(source.meta))).map((source) => source.id)
  if (approvedIds.length) await admin.from("fontes").update({ status: "monitorada" }).in("id", approvedIds)

  return json({ status: "active", icpId: icp.id, version: Number(version ?? icp.versao), queued: true, sourcesActivated: approvedIds.length })
})
