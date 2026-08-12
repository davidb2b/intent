import { supabase } from "@/infrastructure/supabase/client"

export type CurationStatus = "aprovado" | "descartado"

export async function updatePostCuration(postId: string, status: CurationStatus) {
  const { error } = await supabase.from("posts").update({ status_curadoria: status }).eq("id", postId)
  if (error) throw new Error(error.message)
}
