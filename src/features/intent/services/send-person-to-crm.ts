import { supabase } from "@/infrastructure/supabase/client"
import { functionErrorMessage } from "@/lib/supabase-function-error"

export async function sendPersonToCrm(input: { projectId: string; personId: string }) {
  const { data, error } = await supabase.functions.invoke<{ status: "delivered" }>("send-person-to-crm", {
    body: input,
  })
  if (error) throw new Error(await functionErrorMessage(error, "Não foi possível enviar esta pessoa ao CRM agora."))
  if (!data || data.status !== "delivered") throw new Error("O CRM não confirmou o recebimento desta pessoa.")
  return data
}
