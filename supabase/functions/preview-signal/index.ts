import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { judgePublicSignal } from "../_shared/intent-signal-llm.ts"

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" }
type RecordValue = Record<string, unknown>

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }) }
function record(value: unknown): RecordValue { return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {} }
function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim()).map((item) => item.trim()) : [] }
function normalized(value: string) { return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR") }
function includesAny(value: string, options: string[]) { const candidate = normalized(value); return options.some((option) => candidate.includes(normalized(option))) }

function signalRules(value: unknown) {
  const rules = record(value).regras
  if (!Array.isArray(rules)) return []
  return rules.flatMap((item) => {
    const rule = record(item)
    if (typeof rule.nome !== "string" || !rule.nome.trim()) return []
    return [{ nome: rule.nome.trim(), prioridade: typeof rule.prioridade === "string" ? rule.prioridade : undefined, descricao: typeof rule.descricao === "string" ? rule.descricao : undefined, palavras_chave: strings(rule.palavras_chave) }]
  })
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const openAiKey = Deno.env.get("OPENAI_API_KEY")
  if (!supabaseUrl || !serviceRoleKey || !openAiKey) return json({ error: "A avaliação está temporariamente indisponível." }, 503)

  const authHeader = request.headers.get("Authorization")
  if (!authHeader) return json({ error: "Entre na sua conta para continuar." }, 401)
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const userClient = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: "Sua sessão expirou. Entre novamente." }, 401)

  let body: { projectId?: string; evidence?: string; personName?: string; role?: string; company?: string }
  try { body = await request.json() } catch { return json({ error: "Não conseguimos entender esta solicitação." }, 400) }
  const projectId = typeof body.projectId === "string" ? body.projectId : ""
  const evidence = typeof body.evidence === "string" ? body.evidence.trim() : ""
  const role = typeof body.role === "string" ? body.role.trim() : ""
  const company = typeof body.company === "string" ? body.company.trim() : ""
  if (!projectId || !evidence) return json({ error: "Informe uma evidência pública para continuar." }, 400)
  if (evidence.length > 5000) return json({ error: "A evidência precisa ter até 5.000 caracteres." }, 400)

  const { data: project } = await admin.from("projetos").select("id").eq("id", projectId).eq("owner_id", user.id).maybeSingle()
  if (!project) return json({ error: "Não encontramos esta operação na sua conta." }, 404)
  const { data: icp } = await admin.from("icps").select("comprador, sinais_de_compra").eq("projeto_id", projectId).eq("status", "ativo").maybeSingle()
  if (!icp) return json({ error: "Ative o perfil ideal antes de testar uma classificação." }, 409)

  const buyer = record(icp.comprador)
  const desiredRoles = strings(buyer.cargos)
  const desiredSizes = strings(buyer.portes)
  const roleFit = Boolean(role) && (desiredRoles.length === 0 || includesAny(role, desiredRoles))
  const sizeFit = Boolean(company) && (desiredSizes.length === 0 || includesAny(company, desiredSizes) || /(?:^|\D)(?:501|1001|5001|10000)\s*[-+]/.test(company))
  const fit = { cargo: roleFit ? "confirmado" as const : "não confirmado" as const, porte: sizeFit ? "confirmado" as const : "não confirmado" as const, resumo: roleFit && sizeFit ? "Cargo e porte informados correspondem ao perfil ideal ativo." : "O perfil precisa de revisão humana porque cargo ou porte não foram confirmados literalmente." }
  const result = await judgePublicSignal({ apiKey: openAiKey, evidence, context: JSON.stringify({ pessoa: body.personName?.trim() ?? "", cargo: role, empresa: company, aderencia: fit, perfil_ideal: buyer }), ruleDefinitions: signalRules(icp.sinais_de_compra) })
  const fitConfirmed = roleFit && sizeFit
  const status = fitConfirmed && result.judgment.nota >= 80 ? "lead" : fitConfirmed && result.judgment.nota > 0 ? "sinal_fraco" : roleFit || sizeFit ? "revisar" : "fora_icp"
  return json({ status, fit, judgment: { score: result.judgment.nota, rule: result.judgment.regra_que_bateu, evidence: result.judgment.evidencia_citada }, costUsd: result.costUsd, saved: false })
})
