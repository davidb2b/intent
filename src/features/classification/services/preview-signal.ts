import { supabase } from "@/infrastructure/supabase/client"
import { functionErrorMessage } from "@/lib/supabase-function-error"

export type PreviewSignalInput = {
  projectId: string
  evidence: string
  personName: string
  role: string
  company: string
}
export type PreviewSignalResult = {
  status: "lead" | "sinal_fraco" | "fora_icp" | "revisar"
  fit: { cargo: "confirmado" | "não confirmado"; porte: "confirmado" | "não confirmado"; resumo: string }
  judgment: { score: number; rule: string; evidence: string }
  costUsd: number
  saved: false
}

export async function previewSignal(input: PreviewSignalInput): Promise<PreviewSignalResult> {
  if (!input.projectId || !input.evidence.trim()) throw new Error("Informe a evidência pública que deseja avaliar.")
  const { data, error } = await supabase.functions.invoke<PreviewSignalResult>("preview-signal", {
    body: { ...input, evidence: input.evidence.trim(), personName: input.personName.trim(), role: input.role.trim(), company: input.company.trim() },
  })
  if (error) throw new Error(await functionErrorMessage(error, "Não foi possível avaliar esta evidência agora."))
  if (!data) throw new Error("Não recebemos a avaliação. Tente novamente em alguns instantes.")
  return data
}
