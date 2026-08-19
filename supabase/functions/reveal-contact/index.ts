import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

import { ApolloRequestError, revealApolloContact } from "../_shared/apollo-client.ts"
import { decryptContact, encryptContact, extractApolloContact, type ContactType } from "../_shared/contact-reveal.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível consultar este contato agora."
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const apolloApiKey = Deno.env.get("APOLLO_API_KEY")
  const encryptionKey = Deno.env.get("CONTACT_ENCRYPTION_KEY")
  const authHeader = request.headers.get("Authorization")
  if (!supabaseUrl || !serviceRoleKey || !apolloApiKey || !encryptionKey) return json({ error: "A consulta de contato está temporariamente indisponível." }, 503)
  if (!authHeader) return json({ error: "Faça login para consultar um contato." }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const userClient = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: "Sua sessão expirou. Entre novamente para continuar." }, 401)

  let body: { projectId?: string; personId?: string; type?: ContactType; confirmed?: boolean }
  try { body = await request.json() } catch { return json({ error: "Não foi possível compreender esta solicitação." }, 400) }
  if (!body.projectId || !body.personId || (body.type !== "email" && body.type !== "telefone")) return json({ error: "A pessoa e o tipo de contato são obrigatórios." }, 400)
  if (body.confirmed !== true) return json({ error: "Confirme a consulta para continuar." }, 400)

  const { data: person } = await admin
    .from("pessoas")
    .select("id, projeto_id, nome")
    .eq("id", body.personId)
    .eq("projeto_id", body.projectId)
    .maybeSingle()
  if (!person) return json({ error: "Essa pessoa não está disponível na sua operação." }, 404)

  const { data: owner } = await admin.from("projetos").select("id").eq("id", body.projectId).eq("owner_id", user.id).maybeSingle()
  if (!owner) return json({ error: "Você não tem permissão para consultar este contato." }, 403)

  const { data: operation } = await admin.from("pessoa_operacao_privada").select("apollo_id").eq("pessoa_id", person.id).maybeSingle()
  if (!operation?.apollo_id) return json({ error: "Este perfil ainda não possui uma referência segura para consulta de contato." }, 409)

  const { data: started, error: startError } = await admin.rpc("intent_begin_contact_reveal", {
    target_project_id: body.projectId,
    target_person_id: person.id,
    target_user_id: user.id,
    target_type: body.type,
    target_amount: 1,
  }).single()
  if (startError || !started) return json({ error: startError?.message ?? "Não foi possível preparar a consulta de contato." }, 409)

  if (started.status === "insufficient_credits") return json({ error: "Seu saldo disponível não é suficiente para esta consulta." }, 402)
  if (started.status === "processing") return json({ error: "Esta consulta já está em andamento. Aguarde alguns instantes antes de tentar novamente." }, 409)
  if (started.status === "unavailable") return json({ error: "Nenhum contato foi disponibilizado para este perfil. Nenhum crédito foi consumido." }, 404)

  if (started.status === "revealed") {
    const field = body.type === "email" ? "email_ciphertext" : "telefone_ciphertext"
    const { data: contact } = await admin.from("pessoa_contatos_privados").select(field).eq("pessoa_id", person.id).maybeSingle()
    const ciphertext = contact?.[field] as string | null | undefined
    if (!ciphertext) return json({ error: "O contato protegido não está disponível para leitura." }, 409)
    try { return json({ status: "revealed", cached: true, type: body.type, contact: await decryptContact(ciphertext, encryptionKey) }) }
    catch { return json({ error: "O contato protegido não está disponível para leitura." }, 409) }
  }

  const revealId = started.reveal_id as string
  try {
    const response = await revealApolloContact(operation.apollo_id, body.type, apolloApiKey)
    const contact = extractApolloContact(response.payload, body.type)
    if (!contact) {
      await admin.rpc("intent_cancel_contact_reveal", { target_reveal_id: revealId, target_reason: "Contato não disponibilizado pelo provedor.", target_retryable: false })
      return json({ error: "Nenhum contato foi disponibilizado para este perfil. Nenhum crédito foi consumido." }, 404)
    }

    const { error: completeError } = await admin.rpc("intent_complete_contact_reveal", {
      target_reveal_id: revealId,
      target_ciphertext: await encryptContact(contact, encryptionKey),
      target_provider: "apollo",
      target_provider_reference: response.requestId,
      target_metadata: { duration_ms: response.durationMs },
    })
    if (completeError) throw new Error(completeError.message)
    return json({ status: "revealed", cached: false, type: body.type, contact })
  } catch (error) {
    await admin.rpc("intent_cancel_contact_reveal", { target_reveal_id: revealId, target_reason: errorMessage(error), target_retryable: true })
    if (error instanceof ApolloRequestError) return json({ error: error.message }, 503)
    return json({ error: "Não foi possível concluir a consulta agora. Nenhum crédito foi consumido." }, 502)
  }
})
