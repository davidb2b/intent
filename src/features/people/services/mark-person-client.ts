import { supabase } from "@/infrastructure/supabase/client"

export async function markPersonAsClient(personId: string) {
  if (!personId.trim()) throw new Error("Pessoa inválida para esta ação.")
  const { error } = await supabase.from("pessoas").update({ status: "cliente" }).eq("id", personId)
  if (error) throw new Error(error.message)
}
