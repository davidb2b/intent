import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function bearer(secret: string | undefined) {
  return secret ? { Authorization: `Bearer ${secret}` } : {}
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const webhookUrl = Deno.env.get("CRM_WEBHOOK_URL")
  const webhookSecret = Deno.env.get("CRM_WEBHOOK_SECRET")
  const authHeader = request.headers.get("Authorization")

  if (!supabaseUrl || !serviceRoleKey) return json({ error: "A integração está temporariamente indisponível." }, 503)
  if (!webhookUrl) return json({ error: "A integração com o CRM ainda não foi configurada para esta conta." }, 503)
  if (!authHeader) return json({ error: "Faça login para enviar uma pessoa ao CRM." }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const userClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: "Sua sessão expirou. Entre novamente para continuar." }, 401)

  let body: { projectId?: string; personId?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: "Não foi possível compreender esta solicitação." }, 400)
  }
  if (!body.projectId || !body.personId) return json({ error: "Selecione uma pessoa antes de continuar." }, 400)

  const { data: project } = await admin
    .from("projetos")
    .select("id, nome, dominio")
    .eq("id", body.projectId)
    .eq("owner_id", user.id)
    .maybeSingle()
  if (!project) return json({ error: "Você não tem permissão para enviar dados desta operação." }, 403)

  const { data: person } = await admin
    .from("pessoas")
    .select("id, nome, headline, cargo, senioridade, linkedin_url, intencao, status, ultimo_sinal_em, empresa:empresas(nome, linkedin_url)")
    .eq("id", body.personId)
    .eq("projeto_id", body.projectId)
    .maybeSingle()
  if (!person) return json({ error: "Essa pessoa não está disponível na sua operação." }, 404)

  const { data: signals, error: signalError } = await admin
    .from("sinais")
    .select("tipo, evidencia, regra_que_bateu, nota, ocorrido_em")
    .eq("projeto_id", body.projectId)
    .eq("pessoa_id", body.personId)
    .order("ocorrido_em", { ascending: false })
    .limit(10)
  if (signalError) return json({ error: "Não foi possível preparar as evidências desta pessoa agora." }, 502)

  const company = Array.isArray(person.empresa) ? person.empresa[0] : person.empresa
  const payload = {
    event: "intent.person.ready",
    sentAt: new Date().toISOString(),
    operation: { id: project.id, name: project.nome, domain: project.dominio },
    person: {
      id: person.id,
      name: person.nome,
      headline: person.headline,
      role: person.cargo,
      seniority: person.senioridade,
      publicProfileUrl: person.linkedin_url,
      intention: person.intencao,
      status: person.status,
      lastSignalAt: person.ultimo_sinal_em,
    },
    company: company ? { name: company.nome, publicPageUrl: company.linkedin_url } : null,
    publicSignals: signals ?? [],
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...bearer(webhookSecret),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return json({ error: "O CRM não confirmou o recebimento. Tente novamente em alguns instantes." }, 502)
    return json({ status: "delivered" })
  } catch {
    return json({ error: "Não foi possível se conectar ao CRM agora. Tente novamente em alguns instantes." }, 502)
  }
})
