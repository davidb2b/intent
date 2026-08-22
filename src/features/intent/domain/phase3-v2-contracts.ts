export type IntentV2Firmography = {
  nome: string | null;
  setor: string | null;
  funcionarios: number | null;
  fundacao: number | null;
  sede: string | null;
  linkedin_url: string | null;
};

export type IntentV2CompanyGeneration = {
  resumo: string;
  oferta: string;
  proposta_valor: string;
  dores_resolvidas: string[];
  segmentos_atendidos: string[];
  firmografia: IntentV2Firmography;
};

export type IntentV2BuyerGeneration = {
  cargos: string[];
  industrias: string[];
  tamanhos: string[];
};

export type IntentV2SignalsGeneration = {
  dores: string[];
  gatilhos: string[];
  termos: string[];
};

const INVALID_VALUES = new Set([
  "desconhecido",
  "não informado",
  "nao informado",
  "n/a",
  "indefinido",
  "outros",
]);

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} precisa ser informado.`);
  if (INVALID_VALUES.has(normalized(value))) throw new Error(`${field} precisa usar apenas dado confirmado.`);
  return value.trim();
}

function nullableText(value: unknown, field: string): string | null {
  if (value === null) return null;
  return text(value, field);
}

function list(value: unknown, field: string, min: number, max: number): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new Error(`${field} precisa ter entre ${min} e ${max} itens.`);
  }
  const items = value.map((item, index) => text(item, `${field}[${index}]`));
  const unique = new Set(items.map(normalized));
  if (unique.size !== items.length) throw new Error(`${field} não pode conter itens repetidos.`);
  return items;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} precisa ser um objeto.`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[], field: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${field} não segue o contrato esperado.`);
  }
}

function nullablePositiveInteger(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || Number(value) < 1) throw new Error(`${field} precisa ser um número confirmado ou nulo.`);
  return Number(value);
}

export function validateIntentV2CompanyGeneration(value: unknown): IntentV2CompanyGeneration {
  const candidate = record(value, "Perfil da empresa");
  exactKeys(candidate, ["resumo", "oferta", "proposta_valor", "dores_resolvidas", "segmentos_atendidos", "firmografia"], "Perfil da empresa");
  const firmography = record(candidate.firmografia, "firmografia");
  exactKeys(firmography, ["nome", "setor", "funcionarios", "fundacao", "sede", "linkedin_url"], "firmografia");
  const linkedinUrl = nullableText(firmography.linkedin_url, "firmografia.linkedin_url");
  if (linkedinUrl && !/^https?:\/\/.+/i.test(linkedinUrl)) throw new Error("firmografia.linkedin_url precisa ser uma URL pública válida.");
  return {
    resumo: text(candidate.resumo, "resumo"),
    oferta: text(candidate.oferta, "oferta"),
    proposta_valor: text(candidate.proposta_valor, "proposta_valor"),
    dores_resolvidas: list(candidate.dores_resolvidas, "dores_resolvidas", 4, 8),
    segmentos_atendidos: list(candidate.segmentos_atendidos, "segmentos_atendidos", 0, 20),
    firmografia: {
      nome: nullableText(firmography.nome, "firmografia.nome"),
      setor: nullableText(firmography.setor, "firmografia.setor"),
      funcionarios: nullablePositiveInteger(firmography.funcionarios, "firmografia.funcionarios"),
      fundacao: nullablePositiveInteger(firmography.fundacao, "firmografia.fundacao"),
      sede: nullableText(firmography.sede, "firmografia.sede"),
      linkedin_url: linkedinUrl,
    },
  };
}

export function validateIntentV2BuyerGeneration(value: unknown): IntentV2BuyerGeneration {
  const candidate = record(value, "Perfil ideal");
  exactKeys(candidate, ["cargos", "industrias", "tamanhos"], "Perfil ideal");
  return {
    cargos: list(candidate.cargos, "cargos", 4, 8),
    industrias: list(candidate.industrias, "industrias", 0, 20),
    tamanhos: list(candidate.tamanhos, "tamanhos", 0, 20),
  };
}

export function validateIntentV2SignalsGeneration(value: unknown): IntentV2SignalsGeneration {
  const candidate = record(value, "Sinais de compra");
  exactKeys(candidate, ["dores", "gatilhos", "termos"], "Sinais de compra");
  return {
    dores: list(candidate.dores, "dores", 8, 8),
    gatilhos: list(candidate.gatilhos, "gatilhos", 8, 8),
    termos: list(candidate.termos, "termos", 12, 12),
  };
}
