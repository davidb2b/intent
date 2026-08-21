import { describe, expect, it } from "vitest";
import {
  isIntentV2IcpDraftValid,
  validateIntentV2IcpDraft,
  type IntentV2IcpDraft,
} from "./phase1-v2-contracts";

const validDraft: IntentV2IcpDraft = {
  status: "rascunho",
  versao: 1,
  siteUrl: "https://fiedler.com.br",
  empresaLinkedinUrl: "https://www.linkedin.com/company/fiedler-automacao",
  empresa: {
    nome: "Fiedler Automação",
    resumo: "Automação industrial baseada em contexto público confirmado.",
    setor: "Automação industrial",
    porte: null,
    localizacao: "Brasil",
    siteUrl: "https://fiedler.com.br",
    linkedinUrl: "https://www.linkedin.com/company/fiedler-automacao",
    fontes: [{ kind: "site", url: "https://fiedler.com.br" }],
  },
  comprador: {
    cargos: ["Diretor de Operações"],
    setores: ["Indústria"],
    portes: [],
    localizacoes: ["Brasil"],
    fontes: [{ kind: "apollo", url: "https://www.apollo.io" }],
  },
  sinaisDeCompra: {
    dores: ["paradas de produção"],
    gatilhos: ["expansão da planta"],
    termos: ["automação industrial"],
    fontes: [{ kind: "linkedin", url: "https://www.linkedin.com" }],
  },
};

describe("Intent v2 Fase 1 contracts", () => {
  it("accepts an evidence-backed Brazil-first draft", () => {
    expect(isIntentV2IcpDraftValid(validDraft)).toBe(true);
  });

  it("rejects a draft outside Brazil", () => {
    const draft = {
      ...validDraft,
      comprador: { ...validDraft.comprador, localizacoes: ["Portugal"] },
    } as unknown as IntentV2IcpDraft;

    expect(validateIntentV2IcpDraft(draft)).toContain(
      "Brasil precisa ser a primeira localização do radar.",
    );
  });

  it("rejects invented placeholder context", () => {
    const draft = {
      ...validDraft,
      empresa: { ...validDraft.empresa, resumo: "desconhecido" },
    };

    expect(isIntentV2IcpDraftValid(draft)).toBe(false);
    expect(validateIntentV2IcpDraft(draft)).toContain(
      "o contexto da empresa precisa usar apenas dados confirmados.",
    );
  });

  it("rejects a malformed public source", () => {
    const draft = {
      ...validDraft,
      empresa: {
        ...validDraft.empresa,
        fontes: [{ kind: "site", url: "não é uma URL" }],
      },
    } as IntentV2IcpDraft;

    expect(isIntentV2IcpDraftValid(draft)).toBe(false);
  });
});
