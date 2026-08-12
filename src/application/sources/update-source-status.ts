import { supabase } from "@/infrastructure/supabase/client"

export type SourceStatus = "monitorada" | "candidata" | "descartada"

export async function updateSourceStatus(sourceId: string, status: SourceStatus) {
  const { error } = await supabase.from("fontes").update({ status }).eq("id", sourceId)
  if (error) throw new Error(error.message)
}
