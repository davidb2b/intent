export const INTENT_V2_ICP_STATUSES = [
  "rascunho",
  "ativo",
  "arquivado",
] as const;

export type IntentV2IcpStatus = (typeof INTENT_V2_ICP_STATUSES)[number];

export const INTENT_V2_SOURCE_KINDS = ["site", "apollo", "linkedin"] as const;
export type IntentV2SourceKind = (typeof INTENT_V2_SOURCE_KINDS)[number];

export interface IntentV2EvidenceSource {
  kind: IntentV2SourceKind;
  url: string;
}

export interface IntentV2CompanyProfile {
  nome?: string | null;
  resumo?: string | null;
  setor?: string | null;
  porte?: string | null;
  localizacao?: string | null;
  siteUrl: string;
  linkedinUrl?: string | null;
  fontes: IntentV2EvidenceSource[];
}

export interface IntentV2BuyerProfile {
  cargos: string[];
  setores: string[];
  portes: string[];
  localizacoes: ["Brasil", ...string[]];
  fontes: IntentV2EvidenceSource[];
}

export interface IntentV2BuyingSignals {
  dores: string[];
  gatilhos: string[];
  termos: string[];
  fontes: IntentV2EvidenceSource[];
}

export interface IntentV2IcpDraft {
  status: IntentV2IcpStatus;
  versao: number;
  siteUrl: string;
  empresaLinkedinUrl?: string | null;
  empresa: IntentV2CompanyProfile;
  comprador: IntentV2BuyerProfile;
  sinaisDeCompra: IntentV2BuyingSignals;
}

const PLACEHOLDER_VALUES = new Set([
  "desconhecido",
  "não informado",
  "nao informado",
  "n/a",
  "indefinido",
]);

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function hasPlaceholder(value: string | null | undefined): boolean {
  return value !== null && value !== undefined
    ? PLACEHOLDER_VALUES.has(value.trim().toLocaleLowerCase("pt-BR"))
    : false;
}

function validateList(values: string[], path: string, errors: string[]): void {
  values.forEach((value, index) => {
    if (!value.trim()) errors.push(`${path}[${index}] não pode ficar vazio.`);
    if (hasPlaceholder(value)) errors.push(`${path}[${index}] precisa de dado confirmado.`);
  });
}

function validateSources(
  sources: IntentV2EvidenceSource[],
  path: string,
  errors: string[],
): void {
  sources.forEach((source, index) => {
    if (!INTENT_V2_SOURCE_KINDS.includes(source.kind)) {
      errors.push(`${path}[${index}].kind é uma origem inválida.`);
    }
    if (!isHttpUrl(source.url)) {
      errors.push(`${path}[${index}].url precisa ser uma URL pública válida.`);
    }
  });
}

export function validateIntentV2IcpDraft(draft: IntentV2IcpDraft): string[] {
  const errors: string[] = [];

  if (!INTENT_V2_ICP_STATUSES.includes(draft.status)) {
    errors.push("status é inválido.");
  }
  if (!Number.isInteger(draft.versao) || draft.versao < 1) {
    errors.push("versao precisa ser um inteiro positivo.");
  }
  if (!isHttpUrl(draft.siteUrl)) {
    errors.push("siteUrl precisa ser uma URL pública válida.");
  }
  if (draft.empresaLinkedinUrl && !isHttpUrl(draft.empresaLinkedinUrl)) {
    errors.push("empresaLinkedinUrl precisa ser uma URL pública válida.");
  }
  if (draft.empresa.siteUrl !== draft.siteUrl) {
    errors.push("empresa.siteUrl precisa ser igual ao siteUrl do ICP.");
  }
  if (hasPlaceholder(draft.empresa.nome) || hasPlaceholder(draft.empresa.resumo)) {
    errors.push("o contexto da empresa precisa usar apenas dados confirmados.");
  }
  if (draft.comprador.localizacoes[0] !== "Brasil") {
    errors.push("Brasil precisa ser a primeira localização do radar.");
  }

  validateList(draft.comprador.cargos, "comprador.cargos", errors);
  validateList(draft.comprador.setores, "comprador.setores", errors);
  validateList(draft.comprador.portes, "comprador.portes", errors);
  validateList(draft.comprador.localizacoes, "comprador.localizacoes", errors);
  validateList(draft.sinaisDeCompra.dores, "sinaisDeCompra.dores", errors);
  validateList(draft.sinaisDeCompra.gatilhos, "sinaisDeCompra.gatilhos", errors);
  validateList(draft.sinaisDeCompra.termos, "sinaisDeCompra.termos", errors);
  validateSources(draft.empresa.fontes, "empresa.fontes", errors);
  validateSources(draft.comprador.fontes, "comprador.fontes", errors);
  validateSources(draft.sinaisDeCompra.fontes, "sinaisDeCompra.fontes", errors);

  return errors;
}

export function isIntentV2IcpDraftValid(draft: IntentV2IcpDraft): boolean {
  return validateIntentV2IcpDraft(draft).length === 0;
}
