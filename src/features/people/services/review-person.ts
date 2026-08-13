import { supabase } from "@/infrastructure/supabase/client"

export const seniorityOptions = ["diretoria", "gerencia", "analista", "fora"] as const
export type PersonSeniority = (typeof seniorityOptions)[number]

export type PersonReviewInput = {
  personId: string
  role: string
  seniority: PersonSeniority
  icp: boolean
}

export function validatePersonReview(input: PersonReviewInput) {
  if (!input.personId.trim()) throw new Error("Pessoa inválida para revisão.")
  if (!seniorityOptions.includes(input.seniority)) throw new Error("Senioridade inválida.")
  return {
    cargo: input.role.trim() || null,
    senioridade: input.seniority,
    icp: input.icp,
    icp_motivo: "revisao_manual",
    revisado_por_humano: true,
  }
}

export async function reviewPerson(input: PersonReviewInput) {
  const payload = validatePersonReview(input)
  const { error } = await supabase.from("pessoas").update(payload).eq("id", input.personId)
  if (error) throw new Error(error.message)
}
