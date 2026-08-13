import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" }
const SYSTEM_PROMPT = `Você avalia posts do LinkedIn para uma pesquisa de mercado B2B.

Contexto da pesquisa:
- Tema central: {palavra_chave}
- Contextos que tornam um post relevante: {contextos_positivos}
- Contextos que tornam um post irrelevante: {contextos_negativos}

Dado o texto do post e o headline do autor, devolva quatro campos curtos,
de uma a duas frases cada, em português do Brasil:

topico    — o assunto específico do post, em termos concretos
problema  — qual problema de trabalho o post discute. Se não discute nenhum, diga isso.
motivo    — por que este post serve ou não serve para a pesquisa, citando o contexto
            positivo ou negativo que ele satisfaz. Seja direto sobre não servir.
coleta    — quanto vale ler deste post, considerando volume de comentários e o
            perfil de quem provavelmente comenta nele

Devolva JSON: {"topico":"...","problema":"...","motivo":"...","coleta":"..."}
Não escreva nada além do JSON.`

type Analysis = { topico: string; problema: string; motivo: string; coleta: string }

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }) }

function validAnalysis(value: unknown): Analysis {
  if (!value || typeof value !== "object") throw new Error("A IA retornou uma análise inválida.")
  const item = value as Record<string, unknown>
  const fields = ["topico", "problema", "motivo", "coleta"]
  if (fields.some((field) => typeof item[field] !== "string" || !(item[field] as string).trim())) throw new Error("A IA não retornou os quatro campos obrigatórios.")
  return { topico: item.topico as string, problema: item.problema as string, motivo: item.motivo as string, coleta: item.coleta as string }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const openAiKey = Deno.env.get("OPENAI_API_KEY")
  if (!supabaseUrl || !serviceRoleKey || !openAiKey) return json({ error: "Backend de análise não configurado." }, 503)
  const authHeader = request.headers.get("Authorization")
  if (!authHeader) return json({ error: "Faça login para analisar posts." }, 401)
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const userClient = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: "Sessão inválida. Faça login novamente." }, 401)
  let body: { projectId?: string; target?: "discovery" | "monitoring" }
  try { body = await request.json() } catch { return json({ error: "JSON inválido." }, 400) }
  if (!body.projectId) return json({ error: "projectId é obrigatório." }, 400)
  const { data: project } = await admin.from("projetos").select("id").eq("id", body.projectId).eq("owner_id", user.id).maybeSingle()
  if (!project) return json({ error: "Projeto não encontrado para este usuário." }, 404)
  const { data: term } = await admin.from("termos").select("termo, contexto_positivo, contexto_negativo").eq("projeto_id", project.id).eq("ativo", true).order("criado_em", { ascending: false }).limit(1).maybeSingle()
  const target = body.target === "discovery" ? "discovery" : "monitoring"
  const table = target === "discovery" ? "posts_descobertos" : "posts"
  const orderColumn = target === "discovery" ? "descoberto_em" : "coletado_em"
  const { data: post, error: postError } = await admin.from(table).select("id, texto, autor_nome, autor_url, total_comentarios").eq("projeto_id", project.id).is("analise_topico", null).order(orderColumn, { ascending: true }).limit(1).maybeSingle()
  if (postError) return json({ error: postError.message }, 500)
  if (!post) return json({ status: "concluida", analyzed: 0, remaining: 0 })
  const prompt = SYSTEM_PROMPT.replace("{palavra_chave}", term?.termo ?? "").replace("{contextos_positivos}", term?.contexto_positivo ?? "não informado").replace("{contextos_negativos}", term?.contexto_negativo ?? "não informado")
  const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify({ texto: post.texto, autor: post.autor_nome, perfil: post.autor_url, comentarios: post.total_comentarios }) }] }) })
  if (!aiResponse.ok) return json({ error: `Falha na análise por IA (${aiResponse.status}).` }, 502)
  const completion = await aiResponse.json()
  let analysis: Analysis
  try { analysis = validAnalysis(JSON.parse(completion.choices?.[0]?.message?.content ?? "")) } catch (error) { return json({ error: error instanceof Error ? error.message : "JSON inválido retornado pela IA." }, 502) }
  const { error: updateError } = await admin.from(table).update({ analise_topico: analysis.topico, analise_problema: analysis.problema, analise_motivo: analysis.motivo, analise_coleta: analysis.coleta }).eq("id", post.id).eq("projeto_id", project.id)
  if (updateError) return json({ error: updateError.message }, 500)
  const { count } = await admin.from(table).select("id", { count: "exact", head: true }).eq("projeto_id", project.id).is("analise_topico", null)
  return json({ status: "concluida", analyzed: 1, remaining: count ?? 0 })
})
