import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const SYSTEM_PROMPT = `Você classifica comentários de LinkedIn escritos por profissionais de compras e
suprimentos. Para cada comentário, devolva exatamente uma categoria:

dor        — a pessoa descreve um problema concreto que vive hoje no trabalho dela
pergunta   — a pessoa pede uma solução, referência ou opinião sobre como resolver algo
fornecedor — a pessoa cita um software, ferramenta, ERP ou fornecedor pelo nome
pratica    — a pessoa conta como a empresa dela já resolveu ou lida com o assunto
generico   — elogio, concordância, agradecimento ou comentário sem conteúdo próprio

Se o comentário se encaixar em mais de uma, escolha a de maior peso nesta ordem:
dor > pergunta > fornecedor > pratica > generico.

Devolva um objeto JSON exatamente neste formato: {"resultados":[{"id":"<id>","teor":"<categoria>","confianca":<0 a 1>}]}.
Não escreva nada além do JSON.`

const allowedTones = new Set(["dor", "pergunta", "fornecedor", "pratica", "generico"])
// A single response for 40 long LinkedIn comments can be truncated by the
// model. Small complete batches are safer than accepting a partial result.
const MAX_BATCH = 12

type Classification = { id: string; teor: string; confianca: number }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function parseClassifications(value: unknown, expectedIds: Set<string>) {
  if (!Array.isArray(value)) throw new Error("A IA não retornou uma lista JSON.")
  const results: Classification[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== "object") throw new Error("A IA retornou um item inválido.")
    const candidate = item as Record<string, unknown>
    const id = typeof candidate.id === "string" ? candidate.id : ""
    const teor = typeof candidate.teor === "string" ? candidate.teor : ""
    const confianca = typeof candidate.confianca === "number" ? candidate.confianca : -1
    if (!expectedIds.has(id) || seen.has(id) || !allowedTones.has(teor) || confianca < 0 || confianca > 1) {
      throw new Error("A IA retornou categorias, IDs ou confiança inválidos.")
    }
    seen.add(id)
    results.push({ id, teor, confianca })
  }
  if (seen.size !== expectedIds.size) throw new Error("A IA não classificou todos os comentários do lote.")
  return results
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const openAiKey = Deno.env.get("OPENAI_API_KEY")
  if (!supabaseUrl || !serviceRoleKey || !openAiKey) return json({ error: "Backend de classificação não configurado: falta OPENAI_API_KEY ou secret do Supabase." }, 503)

  const authHeader = request.headers.get("Authorization")
  if (!authHeader) return json({ error: "Faça login para classificar comentários." }, 401)
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const userClient = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: "Sessão inválida. Faça login novamente." }, 401)

  let body: { projectId?: string }
  try { body = await request.json() } catch { return json({ error: "JSON inválido." }, 400) }
  if (!body.projectId) return json({ error: "projectId é obrigatório." }, 400)

  const { data: project } = await admin.from("projetos").select("id").eq("id", body.projectId).eq("owner_id", user.id).maybeSingle()
  if (!project) return json({ error: "Projeto não encontrado para este usuário." }, 404)

  const { data: comments, error: commentsError } = await admin
    .from("comentarios")
    .select("id, texto, pessoa:pessoas!inner(nome, headline)")
    .eq("projeto_id", project.id)
    .eq("revisado_por_humano", false)
    .is("teor", null)
    .order("coletado_em", { ascending: true })
    .limit(MAX_BATCH)
  if (commentsError) return json({ error: commentsError.message }, 500)
  if (!comments?.length) return json({ status: "concluida", classified: 0, remaining: 0 })

  const promptInput = comments.map((comment) => {
    const person = Array.isArray(comment.pessoa) ? comment.pessoa[0] : comment.pessoa
    return { id: comment.id, pessoa: person?.nome ?? "", cargo: person?.headline ?? "", comentario: comment.texto }
  })
  const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0, max_tokens: 2200, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: JSON.stringify(promptInput) }] }),
  })
  if (!aiResponse.ok) return json({ error: `Falha na classificação por IA (${aiResponse.status}).` }, 502)
  const completion = await aiResponse.json()
  let parsed: unknown
  try { parsed = JSON.parse(completion.choices?.[0]?.message?.content ?? "") } catch { return json({ error: "A IA retornou JSON inválido." }, 502) }
  const payload = Array.isArray(parsed) ? parsed : (parsed as { resultados?: unknown }).resultados
  let classifications: Classification[]
  try { classifications = parseClassifications(payload, new Set(comments.map((comment) => comment.id))) } catch (error) { return json({ error: error instanceof Error ? error.message : "Resposta inválida da IA." }, 502) }

  for (const classification of classifications) {
    const { error } = await admin.from("comentarios").update({ teor: classification.teor, teor_confianca: classification.confianca }).eq("id", classification.id).eq("projeto_id", project.id).eq("revisado_por_humano", false)
    if (error) return json({ error: `Falha ao salvar classificação: ${error.message}`, classified: 0 }, 500)
  }
  const { count } = await admin.from("comentarios").select("id", { count: "exact", head: true }).eq("projeto_id", project.id).eq("revisado_por_humano", false).is("teor", null)
  return json({ status: "concluida", classified: classifications.length, remaining: count ?? 0 })
})
