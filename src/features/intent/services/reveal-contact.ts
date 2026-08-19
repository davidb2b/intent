import { supabase } from "@/infrastructure/supabase/client"

export type RevealContactType = "email" | "telefone"

type RevealContactResponse = {
  status: "revealed"
  cached: boolean
  type: RevealContactType
  contact: string
}

export async function revealContact(input: {
  projectId: string
  personId: string
  type: RevealContactType
}): Promise<RevealContactResponse> {
  const { data, error } = await supabase.functions.invoke<RevealContactResponse>("reveal-contact", {
    body: { ...input, confirmed: true },
  })
  if (error) {
    const context = error.context
    const payload = context && typeof context === "object" && "json" in context && typeof context.json === "function"
      ? await context.json().catch(() => null)
      : null
    throw new Error(payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : "Não foi possível consultar este contato agora.")
  }
  if (!data?.contact) throw new Error("Nenhum contato foi disponibilizado para este perfil.")
  return data
}
