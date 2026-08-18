import type { BuyerProfileOutput, BuyingSignalsOutput, CompanyProfileOutput } from "@/features/intent/domain/llm-contracts"

export type OnboardingStage = "site" | "market" | "firmography" | "icp" | "concluida" | "falhou"

export interface IntentProject {
  id: string
  name: string
  siteUrl: string | null
  domain: string | null
  onboardingStatus: "nao_iniciado" | "em_andamento" | "concluido" | "falhou"
  onboardingWarning: string | null
  monthlyCredits: number
}

export interface IcpRecord {
  id: string
  projectId: string
  version: number
  status: "rascunho" | "ativo" | "arquivado"
  companySummary: string
  company: CompanyProfileOutput
  buyer: BuyerProfileOutput
  buyingSignals: BuyingSignalsOutput
  costUsd: number
  createdAt: string
  activatedAt: string | null
}

export interface OnboardingExecution {
  id: string
  status: "rodando" | "concluida" | "parcial" | "falhou" | "aguardando_creditos"
  stage: OnboardingStage
  progress: number
  message: string
  error: string | null
  costUsd: number
}

export interface OnboardingWorkspace {
  project: IntentProject
  latestIcp: IcpRecord | null
  activeIcp: IcpRecord | null
  execution: OnboardingExecution | null
}

export const ONBOARDING_STAGES: Array<{
  id: Exclude<OnboardingStage, "concluida" | "falhou">
  title: string
  description: string
}> = [
  { id: "site", title: "Conhecendo a empresa", description: "Oferta, proposta de valor, diferenciais e resultados" },
  { id: "market", title: "Entendendo o mercado", description: "Presença pública, posicionamento e concorrentes" },
  { id: "firmography", title: "Confirmando os dados", description: "Setor, porte, fundação, localização e especialidades" },
  { id: "icp", title: "Criando o perfil ideal", description: "Quem compra, o que importa e quando priorizar" },
]

export function normalizePublicSiteUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error("Informe o site da empresa.")
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(candidate)
  const host = url.hostname.toLowerCase()
  if (!["http:", "https:"].includes(url.protocol) || host === "localhost" || host.endsWith(".local") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    throw new Error("Informe um domínio público válido.")
  }
  url.hash = ""
  url.search = ""
  return url.toString()
}

export function stagePosition(stage: OnboardingStage) {
  if (stage === "concluida") return ONBOARDING_STAGES.length
  if (stage === "falhou") return -1
  return ONBOARDING_STAGES.findIndex((item) => item.id === stage)
}
