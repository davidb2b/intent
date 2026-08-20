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

const KNOWN_SIGNAL_TYPES = new Set<SignalType>([
  "comentou_tema",
  "pediu_indicacao",
  "mudou_cargo",
  "engajou_concorrente",
  "engajou_influenciador",
  "compartilhou_tema",
  "atividade_fraca",
])
const HALF_LIFE_DAYS = 30

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, Math.round(value)))
}

function decayedScore(signal: SignalEvidenceForPriority, now: Date) {
  const score = Number(signal.score ?? 0)
  if (!Number.isFinite(score) || score <= 0) return 0
  const occurredAt = signal.occurredAt ? new Date(signal.occurredAt) : null
  if (!occurredAt || Number.isNaN(occurredAt.getTime())) return 0
  const ageInDays = Math.max(0, (now.getTime() - occurredAt.getTime()) / (24 * 60 * 60 * 1000))
  return Math.min(100, score) * 2 ** (-ageInDays / HALF_LIFE_DAYS)
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
  const knownSignals = signals.filter((signal): signal is SignalEvidenceForPriority & { type: SignalType } => KNOWN_SIGNAL_TYPES.has(signal.type as SignalType))
  const signalTypes = [...new Set(knownSignals.map((signal) => signal.type))]
  // Intenção é a soma das evidências reais, com meia-vida de 30 dias. Não há
  // bônus artificial por tipo, recorrência ou "fit"; esses critérios ficam
  // restritos à classificação e não alteram o que a pessoa fez publicamente.
  const computedScore = knownSignals.reduce((total, signal) => total + decayedScore(signal, now), 0)
  const score = knownSignals.length > 0 ? clamp(computedScore) : clamp(Number(currentIntent ?? 0))
  const isHighPriority = status === "lead" || status === "cliente" || score >= 80

  return {
    score,
    bucket: isHighPriority ? "alta" : "acompanhar",
    label: isHighPriority ? "Prioridade alta" : "Em acompanhamento",
    signalCount: knownSignals.length,
    signalTypes,
  }
}
