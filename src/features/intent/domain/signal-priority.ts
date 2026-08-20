import type { SignalType } from "./contracts"

export type SignalEvidenceForPriority = {
  type: string
  score?: number | null
  occurredAt?: string | null
}

export type SignalPriority = {
  score: number
  bucket: "alta" | "acompanhar"
  label: "Prioridade alta" | "Em acompanhamento"
  signalCount: number
  signalTypes: SignalType[]
}

const SIGNAL_WEIGHTS: Record<SignalType, number> = {
  comentou_tema: 20,
  pediu_indicacao: 30,
  mudou_cargo: 24,
  engajou_concorrente: 28,
  engajou_influenciador: 18,
  compartilhou_tema: 16,
  atividade_fraca: 5,
}

const KNOWN_SIGNAL_TYPES = new Set(Object.keys(SIGNAL_WEIGHTS))

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, Math.round(value)))
}

function isRecent(value: string | null | undefined, now: Date) {
  if (!value) return false
  const occurredAt = new Date(value)
  if (Number.isNaN(occurredAt.getTime())) return false
  const ageInDays = (now.getTime() - occurredAt.getTime()) / (24 * 60 * 60 * 1000)
  return ageInDays >= -1 && ageInDays <= 30
}

export function calculateSignalPriority({
  currentIntent,
  status,
  signals,
  now = new Date(),
}: {
  currentIntent: number | null | undefined
  status: string | null | undefined
  signals: SignalEvidenceForPriority[]
  now?: Date
}): SignalPriority {
  const knownSignals = signals.filter((signal): signal is SignalEvidenceForPriority & { type: SignalType } => KNOWN_SIGNAL_TYPES.has(signal.type))
  const signalTypes = [...new Set(knownSignals.map((signal) => signal.type))]
  const strongestJudgment = Math.max(0, ...knownSignals.map((signal) => Number(signal.score ?? 0)).filter(Number.isFinite))
  const strongestSignalWeight = Math.max(0, ...knownSignals.map((signal) => SIGNAL_WEIGHTS[signal.type]))
  const recentSignals = knownSignals.filter((signal) => isRecent(signal.occurredAt, now)).length
  const recurringBonus = Math.min(15, Math.max(0, knownSignals.length - 1) * 3)
  const evidenceBonus = Math.min(20, Math.round(strongestSignalWeight / 2))
  const recencyBonus = Math.min(10, recentSignals * 2)
  const score = clamp(Math.max(Number(currentIntent ?? 0), strongestJudgment) + recurringBonus + evidenceBonus + recencyBonus)
  const isHighPriority = status === "lead" || status === "cliente" || score >= 80

  return {
    score,
    bucket: isHighPriority ? "alta" : "acompanhar",
    label: isHighPriority ? "Prioridade alta" : "Em acompanhamento",
    signalCount: knownSignals.length,
    signalTypes,
  }
}
