import { describe, expect, it } from "vitest";
import {
  validateIntentV2BuyerGeneration,
  validateIntentV2CompanyGeneration,
  validateIntentV2SignalsGeneration,
} from "./phase3-v2-contracts";

const company = {
  resumo: "Empresa brasileira de software para operações.",
  oferta: "Consultoria e desenvolvimento de software.",
  proposta_valor: "Reduz o tempo entre decisão e entrega.",
  dores_resolvidas: ["Backlog lento", "Falhas de integração", "Baixa cobertura de testes", "Risco de segurança"],
  segmentos_atendidos: ["Serviços financeiros", "Indústria"],
  firmografia: { nome: "Exemplo", setor: "Tecnologia", funcionarios: 120, fundacao: 2016, sede: "São Paulo, Brasil", linkedin_url: "https://www.linkedin.com/company/exemplo" },
};

describe("Intent v2 phase 3 contracts", () => {
  it("accepts the exact company contract with confirmed and nullable firmography", () => {
    expect(validateIntentV2CompanyGeneration(company).firmografia.nome).toBe("Exemplo");
    expect(validateIntentV2CompanyGeneration({ ...company, firmografia: { ...company.firmografia, fundacao: null } }).firmografia.fundacao).toBeNull();
  });

  it("rejects placeholders, invented buckets and additional properties", () => {
    expect(() => validateIntentV2CompanyGeneration({ ...company, segmentos_atendidos: ["Outros"] })).toThrow("dado confirmado");
    expect(() => validateIntentV2CompanyGeneration({ ...company, score: 99 })).toThrow("contrato esperado");
  });

  it("requires concrete ICP roles and exact signals quantities", () => {
    expect(validateIntentV2BuyerGeneration({ cargos: ["Diretor de Tecnologia", "Head de Engenharia", "Gerente de Produto", "CTO"], industrias: ["Tecnologia"], tamanhos: ["51-200"] }).cargos).toHaveLength(4);
    expect(() => validateIntentV2BuyerGeneration({ cargos: ["CTO"], industrias: [], tamanhos: [] })).toThrow("entre 4 e 8");
    expect(() => validateIntentV2SignalsGeneration({ dores: Array(8).fill("Dor"), gatilhos: Array(8).fill("Gatilho"), termos: Array(12).fill("Termo") })).toThrow("itens repetidos");
  });
});
