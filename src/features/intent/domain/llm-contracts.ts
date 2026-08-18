import type { SignalJudgment } from "./contracts";
import { isLiteralEvidence, isValidScore } from "./contracts";

export const LLM_SCHEMA_VERSION = 1 as const;

export const COMPANY_SIZE_BANDS = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1001-5000",
  "5001-10000",
  "10000+",
  "desconhecido",
] as const;
export type CompanySizeBand = (typeof COMPANY_SIZE_BANDS)[number];

export const SENIORITIES = [
  "owner",
  "founder",
  "c_suite",
  "partner",
  "vp",
  "head",
  "director",
  "manager",
  "senior",
  "entry",
  "intern",
] as const;
export type Seniority = (typeof SENIORITIES)[number];

export const INDUSTRY_FAMILIES = [
  "tecnologia",
  "servicos_profissionais",
  "financeiro",
  "saude",
  "varejo",
  "transporte_logistica",
  "aviacao",
  "energia_utilities",
  "manufatura",
  "telecomunicacoes",
  "educacao",
  "governo",
  "outros",
] as const;
export type IndustryFamily = (typeof INDUSTRY_FAMILIES)[number];

export const EXCLUSION_TYPES = [
  "mesma_categoria",
  "open_to_work",
  "dominio_proprio",
  "concorrente",
  "cliente_atual",
] as const;
export type ExclusionType = (typeof EXCLUSION_TYPES)[number];

export const PRIORITY_LEVELS = ["High", "Medium"] as const;
export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];

export interface CompanyProfileOutput {
  schema_version: "intent.company_profile.v1";
  idioma: string;
  empresa_resumo: string;
  oferta: string;
  proposta_valor: string;
  dores_resolvidas: string[];
  diferenciais: string[];
  provas_sociais: Array<{
    afirmacao: string;
    evidencia_literal: string;
    fonte_url: string;
  }>;
  segmentos_atendidos: string[];
  palavras_categoria: string[];
  firmografia: {
    nome: string;
    dominio: string;
    linkedin_url: string | null;
    industria_literal: string;
    faixa_funcionarios: CompanySizeBand;
    fundada_em: number | null;
    sede: string;
    pais: string;
  };
}

export interface BuyerProfileOutput {
  schema_version: "intent.buyer_profile.v1";
  cargos: string[];
  senioridades: Seniority[];
  setores: Array<{
    familia: IndustryFamily;
    label_linkedin: string;
  }>;
  portes: CompanySizeBand[];
  regioes: string[];
  exclusoes: Array<{
    tipo: ExclusionType;
    valor: string;
    motivo: string;
  }>;
}

export interface BuyingSignalsOutput {
  schema_version: "intent.buying_signals.v1";
  idioma: string;
  dores: string[];
  gatilhos: string[];
  temas: string[];
  concorrentes: Array<{
    nome: string;
    dominio: string;
    motivo: string;
  }>;
  regras: Array<{
    nome: string;
    prioridade: PriorityLevel;
    descricao: string;
    palavras_chave: string[];
  }>;
}

type JsonSchema = Record<string, unknown>;

const nonEmptyString = { type: "string", minLength: 1 } as const;
const stringArray = (minItems: number, maxItems: number): JsonSchema => ({
  type: "array",
  minItems,
  maxItems,
  uniqueItems: true,
  items: nonEmptyString,
});

export const COMPANY_PROFILE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "idioma",
    "empresa_resumo",
    "oferta",
    "proposta_valor",
    "dores_resolvidas",
    "diferenciais",
    "provas_sociais",
    "segmentos_atendidos",
    "palavras_categoria",
    "firmografia",
  ],
  properties: {
    schema_version: { type: "string", const: "intent.company_profile.v1" },
    idioma: nonEmptyString,
    empresa_resumo: nonEmptyString,
    oferta: nonEmptyString,
    proposta_valor: nonEmptyString,
    dores_resolvidas: stringArray(1, 8),
    diferenciais: stringArray(1, 8),
    provas_sociais: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["afirmacao", "evidencia_literal", "fonte_url"],
        properties: {
          afirmacao: nonEmptyString,
          evidencia_literal: nonEmptyString,
          fonte_url: nonEmptyString,
        },
      },
    },
    segmentos_atendidos: stringArray(1, 20),
    palavras_categoria: stringArray(1, 20),
    firmografia: {
      type: "object",
      additionalProperties: false,
      required: [
        "nome",
        "dominio",
        "linkedin_url",
        "industria_literal",
        "faixa_funcionarios",
        "fundada_em",
        "sede",
        "pais",
      ],
      properties: {
        nome: nonEmptyString,
        dominio: nonEmptyString,
        linkedin_url: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] },
        industria_literal: nonEmptyString,
        faixa_funcionarios: { type: "string", enum: COMPANY_SIZE_BANDS },
        fundada_em: { type: ["integer", "null"], minimum: 1800, maximum: 2200 },
        sede: nonEmptyString,
        pais: nonEmptyString,
      },
    },
  },
};

export const BUYER_PROFILE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "cargos", "senioridades", "setores", "portes", "regioes", "exclusoes"],
  properties: {
    schema_version: { type: "string", const: "intent.buyer_profile.v1" },
    cargos: stringArray(1, 20),
    senioridades: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", enum: SENIORITIES } },
    setores: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["familia", "label_linkedin"],
        properties: {
          familia: { type: "string", enum: INDUSTRY_FAMILIES },
          label_linkedin: nonEmptyString,
        },
      },
    },
    portes: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", enum: COMPANY_SIZE_BANDS } },
    regioes: stringArray(1, 20),
    exclusoes: {
      type: "array",
      minItems: EXCLUSION_TYPES.length,
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tipo", "valor", "motivo"],
        properties: {
          tipo: { type: "string", enum: EXCLUSION_TYPES },
          valor: nonEmptyString,
          motivo: nonEmptyString,
        },
      },
    },
  },
};

export const BUYING_SIGNALS_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "idioma", "dores", "gatilhos", "temas", "concorrentes", "regras"],
  properties: {
    schema_version: { type: "string", const: "intent.buying_signals.v1" },
    idioma: nonEmptyString,
    dores: stringArray(8, 8),
    gatilhos: stringArray(8, 8),
    temas: stringArray(12, 12),
    concorrentes: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nome", "dominio", "motivo"],
        properties: { nome: nonEmptyString, dominio: nonEmptyString, motivo: nonEmptyString },
      },
    },
    regras: {
      type: "array",
      minItems: 6,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nome", "prioridade", "descricao", "palavras_chave"],
        properties: {
          nome: nonEmptyString,
          prioridade: { type: "string", enum: PRIORITY_LEVELS },
          descricao: nonEmptyString,
          palavras_chave: stringArray(1, 30),
        },
      },
    },
  },
};

export const SIGNAL_JUDGMENT_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["nota", "regra_que_bateu", "evidencia_citada"],
  properties: {
    nota: { type: "integer", minimum: 0, maximum: 100 },
    regra_que_bateu: nonEmptyString,
    evidencia_citada: nonEmptyString,
  },
};

export class LlmSchemaValidationError extends Error {
  readonly code = "llm_schema_invalid";
}

function fail(path: string, reason: string): never {
  throw new LlmSchemaValidationError(`${path}: ${reason}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "objeto esperado");
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(path, "campos ausentes ou adicionais");
  }
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) fail(path, "texto obrigatório");
  return value.trim();
}

function texts(value: unknown, path: string, min: number, max: number): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(path, `esperado entre ${min} e ${max} itens`);
  const parsed = value.map((item, index) => text(item, `${path}[${index}]`));
  if (new Set(parsed).size !== parsed.length) fail(path, "itens duplicados");
  return parsed;
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] {
  const parsed = text(value, path);
  if (!(allowed as readonly string[]).includes(parsed)) fail(path, "valor fora da taxonomia");
  return parsed as T[number];
}

function nullableText(value: unknown, path: string): string | null {
  return value === null ? null : text(value, path);
}

function domain(value: unknown, path: string): string {
  const parsed = text(value, path).toLowerCase();
  if (parsed.includes("://") || parsed.includes("/") || !parsed.includes(".")) fail(path, "domínio sem protocolo esperado");
  return parsed;
}

export function parseCompanyProfile(value: unknown): CompanyProfileOutput {
  const root = record(value, "company_profile");
  exactKeys(root, ["schema_version", "idioma", "empresa_resumo", "oferta", "proposta_valor", "dores_resolvidas", "diferenciais", "provas_sociais", "segmentos_atendidos", "palavras_categoria", "firmografia"], "company_profile");
  if (root.schema_version !== "intent.company_profile.v1") fail("company_profile.schema_version", "versão incompatível");
  const proofItems = root.provas_sociais;
  if (!Array.isArray(proofItems) || proofItems.length > 12) fail("company_profile.provas_sociais", "lista inválida");
  const provasSociais = proofItems.map((item, index) => {
    const proof = record(item, `company_profile.provas_sociais[${index}]`);
    exactKeys(proof, ["afirmacao", "evidencia_literal", "fonte_url"], `company_profile.provas_sociais[${index}]`);
    return { afirmacao: text(proof.afirmacao, "afirmacao"), evidencia_literal: text(proof.evidencia_literal, "evidencia_literal"), fonte_url: text(proof.fonte_url, "fonte_url") };
  });
  const firmography = record(root.firmografia, "company_profile.firmografia");
  exactKeys(firmography, ["nome", "dominio", "linkedin_url", "industria_literal", "faixa_funcionarios", "fundada_em", "sede", "pais"], "company_profile.firmografia");
  const founded = firmography.fundada_em;
  if (founded !== null && (!Number.isInteger(founded) || (founded as number) < 1800 || (founded as number) > 2200)) fail("company_profile.firmografia.fundada_em", "ano inválido");
  return {
    schema_version: "intent.company_profile.v1",
    idioma: text(root.idioma, "company_profile.idioma"),
    empresa_resumo: text(root.empresa_resumo, "company_profile.empresa_resumo"),
    oferta: text(root.oferta, "company_profile.oferta"),
    proposta_valor: text(root.proposta_valor, "company_profile.proposta_valor"),
    dores_resolvidas: texts(root.dores_resolvidas, "company_profile.dores_resolvidas", 1, 8),
    diferenciais: texts(root.diferenciais, "company_profile.diferenciais", 1, 8),
    provas_sociais: provasSociais,
    segmentos_atendidos: texts(root.segmentos_atendidos, "company_profile.segmentos_atendidos", 1, 20),
    palavras_categoria: texts(root.palavras_categoria, "company_profile.palavras_categoria", 1, 20),
    firmografia: {
      nome: text(firmography.nome, "company_profile.firmografia.nome"),
      dominio: domain(firmography.dominio, "company_profile.firmografia.dominio"),
      linkedin_url: nullableText(firmography.linkedin_url, "company_profile.firmografia.linkedin_url"),
      industria_literal: text(firmography.industria_literal, "company_profile.firmografia.industria_literal"),
      faixa_funcionarios: enumValue(firmography.faixa_funcionarios, COMPANY_SIZE_BANDS, "company_profile.firmografia.faixa_funcionarios"),
      fundada_em: founded as number | null,
      sede: text(firmography.sede, "company_profile.firmografia.sede"),
      pais: text(firmography.pais, "company_profile.firmografia.pais"),
    },
  };
}

export function parseBuyerProfile(value: unknown): BuyerProfileOutput {
  const root = record(value, "buyer_profile");
  exactKeys(root, ["schema_version", "cargos", "senioridades", "setores", "portes", "regioes", "exclusoes"], "buyer_profile");
  if (root.schema_version !== "intent.buyer_profile.v1") fail("buyer_profile.schema_version", "versão incompatível");
  if (!Array.isArray(root.senioridades) || !root.senioridades.length) fail("buyer_profile.senioridades", "lista obrigatória");
  if (!Array.isArray(root.portes) || !root.portes.length) fail("buyer_profile.portes", "lista obrigatória");
  if (!Array.isArray(root.setores) || !root.setores.length || root.setores.length > 20) fail("buyer_profile.setores", "lista inválida");
  const setores = root.setores.map((item, index) => {
    const sector = record(item, `buyer_profile.setores[${index}]`);
    exactKeys(sector, ["familia", "label_linkedin"], `buyer_profile.setores[${index}]`);
    return { familia: enumValue(sector.familia, INDUSTRY_FAMILIES, `buyer_profile.setores[${index}].familia`), label_linkedin: text(sector.label_linkedin, `buyer_profile.setores[${index}].label_linkedin`) };
  });
  if (!Array.isArray(root.exclusoes) || root.exclusoes.length < EXCLUSION_TYPES.length || root.exclusoes.length > 30) fail("buyer_profile.exclusoes", "lista inválida");
  const exclusoes = root.exclusoes.map((item, index) => {
    const exclusion = record(item, `buyer_profile.exclusoes[${index}]`);
    exactKeys(exclusion, ["tipo", "valor", "motivo"], `buyer_profile.exclusoes[${index}]`);
    return { tipo: enumValue(exclusion.tipo, EXCLUSION_TYPES, `buyer_profile.exclusoes[${index}].tipo`), valor: text(exclusion.valor, `buyer_profile.exclusoes[${index}].valor`), motivo: text(exclusion.motivo, `buyer_profile.exclusoes[${index}].motivo`) };
  });
  const exclusionSet = new Set(exclusoes.map((item) => item.tipo));
  if (EXCLUSION_TYPES.some((type) => !exclusionSet.has(type))) fail("buyer_profile.exclusoes", "as cinco exclusões obrigatórias devem existir");
  const regioes = texts(root.regioes, "buyer_profile.regioes", 1, 20);
  if (!regioes.some((region) => resolveCountry(region) === "brasil")) fail("buyer_profile.regioes", "Brasil é obrigatório na V1");
  const senioridades = root.senioridades.map((item, index) => enumValue(item, SENIORITIES, `buyer_profile.senioridades[${index}]`));
  if (new Set(senioridades).size !== senioridades.length) fail("buyer_profile.senioridades", "itens duplicados");
  const portes = root.portes.map((item, index) => enumValue(item, COMPANY_SIZE_BANDS, `buyer_profile.portes[${index}]`));
  if (new Set(portes).size !== portes.length) fail("buyer_profile.portes", "itens duplicados");
  if (new Set(setores.map((item) => item.label_linkedin)).size !== setores.length) fail("buyer_profile.setores", "setores duplicados");
  return {
    schema_version: "intent.buyer_profile.v1",
    cargos: texts(root.cargos, "buyer_profile.cargos", 1, 20),
    senioridades,
    setores,
    portes,
    regioes,
    exclusoes,
  };
}

function resolveCountry(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export function parseBuyingSignals(value: unknown): BuyingSignalsOutput {
  const root = record(value, "buying_signals");
  exactKeys(root, ["schema_version", "idioma", "dores", "gatilhos", "temas", "concorrentes", "regras"], "buying_signals");
  if (root.schema_version !== "intent.buying_signals.v1") fail("buying_signals.schema_version", "versão incompatível");
  if (!Array.isArray(root.concorrentes) || root.concorrentes.length !== 5) fail("buying_signals.concorrentes", "exatamente cinco concorrentes");
  const concorrentes = root.concorrentes.map((item, index) => {
    const competitor = record(item, `buying_signals.concorrentes[${index}]`);
    exactKeys(competitor, ["nome", "dominio", "motivo"], `buying_signals.concorrentes[${index}]`);
    return { nome: text(competitor.nome, "nome"), dominio: domain(competitor.dominio, "dominio"), motivo: text(competitor.motivo, "motivo") };
  });
  if (new Set(concorrentes.map((item) => item.dominio)).size !== concorrentes.length) fail("buying_signals.concorrentes", "domínios duplicados");
  if (!Array.isArray(root.regras) || root.regras.length < 6 || root.regras.length > 8) fail("buying_signals.regras", "esperado entre seis e oito regras");
  const regras = root.regras.map((item, index) => {
    const rule = record(item, `buying_signals.regras[${index}]`);
    exactKeys(rule, ["nome", "prioridade", "descricao", "palavras_chave"], `buying_signals.regras[${index}]`);
    return { nome: text(rule.nome, "nome"), prioridade: enumValue(rule.prioridade, PRIORITY_LEVELS, "prioridade"), descricao: text(rule.descricao, "descricao"), palavras_chave: texts(rule.palavras_chave, "palavras_chave", 1, 30) };
  });
  if (new Set(regras.map((item) => item.nome)).size !== regras.length) fail("buying_signals.regras", "regras duplicadas");
  return {
    schema_version: "intent.buying_signals.v1",
    idioma: text(root.idioma, "buying_signals.idioma"),
    dores: texts(root.dores, "buying_signals.dores", 8, 8),
    gatilhos: texts(root.gatilhos, "buying_signals.gatilhos", 8, 8),
    temas: texts(root.temas, "buying_signals.temas", 12, 12),
    concorrentes,
    regras,
  };
}

export function validateLiteralSocialProof(
  profile: CompanyProfileOutput,
  sourceTextByUrl: Readonly<Record<string, string>>,
): void {
  for (const [index, proof] of profile.provas_sociais.entries()) {
    const source = sourceTextByUrl[proof.fonte_url];
    if (!source || !source.includes(proof.evidencia_literal)) {
      fail(`company_profile.provas_sociais[${index}].evidencia_literal`, "evidência não encontrada na fonte");
    }
  }
}

export function parseSignalJudgment(
  value: unknown,
  capturedEvidence: string,
  allowedRules: readonly string[],
): SignalJudgment {
  const root = record(value, "signal_judgment");
  exactKeys(root, ["nota", "regra_que_bateu", "evidencia_citada"], "signal_judgment");
  if (typeof root.nota !== "number" || !isValidScore(root.nota)) fail("signal_judgment.nota", "inteiro entre 0 e 100 esperado");
  const rule = text(root.regra_que_bateu, "signal_judgment.regra_que_bateu");
  if (rule !== "nenhuma" && !allowedRules.includes(rule)) fail("signal_judgment.regra_que_bateu", "regra não pertence ao ICP");
  const evidence = text(root.evidencia_citada, "signal_judgment.evidencia_citada");
  if (!isLiteralEvidence(capturedEvidence, evidence)) fail("signal_judgment.evidencia_citada", "citação não é literal");
  return { nota: root.nota, regra_que_bateu: rule, evidencia_citada: evidence };
}

export function shouldRunIntentJudgment(fit: number, excluded: boolean): boolean {
  if (!isValidScore(fit)) throw new RangeError("Fit score must be an integer from 0 to 100");
  return !excluded && fit >= 60;
}

export interface LlmOperationConfig {
  model: "gpt-5.4-mini-2026-03-17" | "gpt-5.4-nano-2026-03-17";
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostUsd: number;
  schemaName: string;
}

const PRICES_USD_PER_MILLION = {
  "gpt-5.4-mini-2026-03-17": { input: 0.75, output: 4.5 },
  "gpt-5.4-nano-2026-03-17": { input: 0.2, output: 1.25 },
} as const;

export const LLM_OPERATIONS = {
  company_profile: { model: "gpt-5.4-nano-2026-03-17", maxInputTokens: 48_000, maxOutputTokens: 2_500, maxCostUsd: 0.015, schemaName: "intent_company_profile_v1" },
  buyer_profile: { model: "gpt-5.4-nano-2026-03-17", maxInputTokens: 12_000, maxOutputTokens: 2_500, maxCostUsd: 0.007, schemaName: "intent_buyer_profile_v1" },
  buying_signals: { model: "gpt-5.4-mini-2026-03-17", maxInputTokens: 16_000, maxOutputTokens: 4_000, maxCostUsd: 0.035, schemaName: "intent_buying_signals_v1" },
  judge_signal: { model: "gpt-5.4-nano-2026-03-17", maxInputTokens: 4_000, maxOutputTokens: 500, maxCostUsd: 0.002, schemaName: "intent_signal_judgment_v1" },
} as const satisfies Record<string, LlmOperationConfig>;

export function worstCaseLlmCostUsd(config: LlmOperationConfig): number {
  const price = PRICES_USD_PER_MILLION[config.model];
  return (config.maxInputTokens * price.input + config.maxOutputTokens * price.output) / 1_000_000;
}

export function openAiStrictTextFormat(schemaName: string, schema: JsonSchema) {
  return { type: "json_schema", name: schemaName, strict: true, schema } as const;
}
