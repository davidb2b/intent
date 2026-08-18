import { describe, expect, it } from "vitest";
import fixture from "../../../../docs/intent-v1/fixtures/5by5-llm-schema-homologation.json";
import {
  BUYER_PROFILE_SCHEMA,
  BUYING_SIGNALS_SCHEMA,
  COMPANY_PROFILE_SCHEMA,
  LLM_OPERATIONS,
  openAiStrictTextFormat,
  parseBuyerProfile,
  parseBuyingSignals,
  parseCompanyProfile,
  parseSignalJudgment,
  shouldRunIntentJudgment,
  validateLiteralSocialProof,
  worstCaseLlmCostUsd,
} from "./llm-contracts";

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe("Intent v1 strict LLM contracts", () => {
  it("accepts the three outputs from the real 5by5 PoC", () => {
    const company = parseCompanyProfile(fixture.companyProfile);
    const buyer = parseBuyerProfile(fixture.buyerProfile);
    const signals = parseBuyingSignals(fixture.buyingSignals);

    expect(company.firmografia.nome).toBe("5by5");
    expect(buyer.regioes).toEqual(["Brasil"]);
    expect(signals.dores).toHaveLength(8);
    expect(signals.gatilhos).toHaveLength(8);
    expect(signals.temas).toHaveLength(12);
    expect(signals.concorrentes).toHaveLength(5);
    expect(signals.regras).toHaveLength(6);
  });

  it("proves every social claim with a literal source excerpt", () => {
    const company = parseCompanyProfile(fixture.companyProfile);
    expect(() => validateLiteralSocialProof(company, fixture.sourceTextByUrl)).not.toThrow();

    const invalidSources = { ...fixture.sourceTextByUrl, "https://www.5by5.com.br": "texto sem a prova" };
    expect(() => validateLiteralSocialProof(company, invalidSources)).toThrow(/evidência não encontrada/);
  });

  it("rejects extra fields and incompatible schema versions", () => {
    expect(() => parseCompanyProfile({ ...fixture.companyProfile, inventado: true })).toThrow(/campos ausentes ou adicionais/);
    expect(() => parseBuyerProfile({ ...fixture.buyerProfile, schema_version: "intent.buyer_profile.v2" })).toThrow(/versão incompatível/);
    expect(() => parseBuyingSignals({ ...fixture.buyingSignals, idioma: "" })).toThrow(/texto obrigatório/);
  });

  it("rejects open taxonomies and missing mandatory exclusions", () => {
    const invalidBuyer = clone(fixture.buyerProfile);
    invalidBuyer.senioridades = ["presidente_global"];
    expect(() => parseBuyerProfile(invalidBuyer)).toThrow(/fora da taxonomia/);

    const missingOwnDomain = clone(fixture.buyerProfile);
    missingOwnDomain.exclusoes = missingOwnDomain.exclusoes.filter((item) => item.tipo !== "dominio_proprio");
    expect(() => parseBuyerProfile(missingOwnDomain)).toThrow(/lista inválida|cinco exclusões obrigatórias/);
  });

  it("rejects non-Brazilian onboarding scope in V1", () => {
    const invalidBuyer = clone(fixture.buyerProfile);
    invalidBuyer.regioes = ["Portugal"];
    expect(() => parseBuyerProfile(invalidBuyer)).toThrow(/Brasil é obrigatório/);
  });

  it("rejects counts that violate the product contract", () => {
    const invalidSignals = clone(fixture.buyingSignals);
    invalidSignals.dores = invalidSignals.dores.slice(0, 7);
    expect(() => parseBuyingSignals(invalidSignals)).toThrow(/esperado entre 8 e 8 itens/);

    const invalidCompetitors = clone(fixture.buyingSignals);
    invalidCompetitors.concorrentes = invalidCompetitors.concorrentes.slice(0, 4);
    expect(() => parseBuyingSignals(invalidCompetitors)).toThrow(/exatamente cinco/);
  });

  it("uses strict JSON Schema without additional properties", () => {
    for (const [name, schema] of Object.entries({
      company: COMPANY_PROFILE_SCHEMA,
      buyer: BUYER_PROFILE_SCHEMA,
      signals: BUYING_SIGNALS_SCHEMA,
    })) {
      expect(schema.additionalProperties, name).toBe(false);
      expect(openAiStrictTextFormat(`intent_${name}_v1`, schema)).toMatchObject({
        type: "json_schema",
        strict: true,
      });
    }
  });

  it("keeps the worst-case cost below the ceiling for every operation", () => {
    for (const [operation, config] of Object.entries(LLM_OPERATIONS)) {
      expect(worstCaseLlmCostUsd(config), operation).toBeLessThanOrEqual(config.maxCostUsd);
    }
  });
});

describe("Intent v1 judgment golden suite", () => {
  const rules = [
    "Avaliação direta de parceiro tecnológico",
    "Dor tecnológica declarada",
    "Programa ativo com orçamento ou prazo",
  ];

  it("accepts a strong literal buying signal", () => {
    const captured = "Estamos avaliando parceiros de engenharia para a migração e precisamos de recomendações.";
    expect(
      parseSignalJudgment(
        { nota: 96, regra_que_bateu: rules[0], evidencia_citada: "avaliando parceiros de engenharia" },
        captured,
        rules,
      ).nota,
    ).toBe(96);
  });

  it("accepts a weak generic signal only with the controlled empty rule", () => {
    const captured = "Parabéns pelo conteúdo, excelente reflexão.";
    expect(
      parseSignalJudgment(
        { nota: 25, regra_que_bateu: "nenhuma", evidencia_citada: "Parabéns pelo conteúdo" },
        captured,
        rules,
      ).nota,
    ).toBe(25);
  });

  it("rejects a paraphrase presented as literal evidence", () => {
    expect(() =>
      parseSignalJudgment(
        { nota: 90, regra_que_bateu: rules[1], evidencia_citada: "a empresa tem uma dor urgente" },
        "Nosso sistema legado não escala mais.",
        rules,
      ),
    ).toThrow(/citação não é literal/);
  });

  it("rejects a rule that does not belong to the active ICP", () => {
    expect(() =>
      parseSignalJudgment(
        { nota: 82, regra_que_bateu: "Regra inventada", evidencia_citada: "orçamento aprovado" },
        "Temos orçamento aprovado para modernização.",
        rules,
      ),
    ).toThrow(/regra não pertence/);
  });

  it("rejects fractional and out-of-range scores", () => {
    expect(() => parseSignalJudgment({ nota: 80.5, regra_que_bateu: "nenhuma", evidencia_citada: "conteúdo" }, "conteúdo", rules)).toThrow(/inteiro entre 0 e 100/);
    expect(() => parseSignalJudgment({ nota: 101, regra_que_bateu: "nenhuma", evidencia_citada: "conteúdo" }, "conteúdo", rules)).toThrow(/inteiro entre 0 e 100/);
  });

  it("stops outside-ICP and excluded people before the paid LLM judgment", () => {
    expect(shouldRunIntentJudgment(59, false)).toBe(false);
    expect(shouldRunIntentJudgment(95, true)).toBe(false);
    expect(shouldRunIntentJudgment(60, false)).toBe(true);
  });
});
