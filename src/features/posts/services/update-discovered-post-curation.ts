import { supabase } from "@/infrastructure/supabase/client"

import type { CurationStatus } from "./update-post-curation"

export async function updateDiscoveredPostCuration(postId: string, status: CurationStatus) {
  const { error } = await supabase.from("posts_descobertos").update({ status_curadoria: status }).eq("id", postId)
  if (error) throw new Error(error.message)
}
