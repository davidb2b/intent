export const ICP_STATUSES = ["rascunho", "ativo", "arquivado"] as const;
export type IcpStatus = (typeof ICP_STATUSES)[number];

export const PERSON_ORIGINS = [
  "semente_apollo",
  "cascata_empresa",
  "cascata_post",
  "cascata_autor",
] as const;
export type PersonOrigin = (typeof PERSON_ORIGINS)[number];

export const PERSON_STATUSES = [
  "vigiado",
  "lead",
  "sinal_fraco",
  "cliente",
  "fora_icp",
] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

export const SIGNAL_TYPES = [
  "comentou_tema",
  "pediu_indicacao",
  "mudou_cargo",
  "engajou_concorrente",
  "engajou_influenciador",
  "compartilhou_tema",
  "atividade_fraca",
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export const JOB_TYPES = [
  "gerar_icp",
  "semear_radar",
  "vigiar_pessoa",
  "julgar_sinal",
  "varrer_post",
  "varrer_empresa",
  "investigar_autor",
  "varrer_watchlist",
  "revelar_contato",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = [
  "pendente",
  "rodando",
  "concluido",
  "falhou",
  "aguardando_creditos",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const COMPANY_LEVELS = ["em_movimento", "aquecendo", "fria"] as const;
export type CompanyLevel = (typeof COMPANY_LEVELS)[number];

export const CREDIT_COSTS = {
  onboarding: 12,
  pessoa_julgada: 1,
  email_revelado: 1,
  telefone_revelado: 10,
  verificacao_sem_sinal: 0,
} as const;
export type CreditEventType = keyof typeof CREDIT_COSTS;

export interface SignalJudgment {
  nota: number;
  regra_que_bateu: string;
  evidencia_citada: string;
}

export function isValidScore(score: number): boolean {
  return Number.isInteger(score) && score >= 0 && score <= 100;
}

export function isClientVisiblePersonStatus(
  status: PersonStatus,
  includeAudit = false,
): boolean {
  if (status === "fora_icp") return includeAudit;
  return status === "lead" || status === "sinal_fraco" || status === "cliente";
}

export function statusFromIntent(intent: number, hasSignal: boolean): PersonStatus {
  if (!isValidScore(intent)) throw new RangeError("Intent score must be an integer from 0 to 100");
  if (!hasSignal) return "vigiado";
  return intent >= 80 ? "lead" : "sinal_fraco";
}

export function isLiteralEvidence(
  capturedEvidence: string,
  citedEvidence: string,
): boolean {
  const captured = capturedEvidence.trim();
  const cited = citedEvidence.trim();
  return cited.length > 0 && captured.includes(cited);
}

