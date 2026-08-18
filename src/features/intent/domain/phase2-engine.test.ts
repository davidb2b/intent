import { describe, expect, it } from "vitest";
import {
  apolloSearchPersonIds,
  assessApolloFit,
  buildApolloCompanyPeopleSearchInput,
  buildPersonJudgmentPayload,
  buildApolloPeopleSearchInput,
  candidateBelongsToCompany,
  normalizeEnrichedApolloPerson,
  personJudgmentCreditReference,
  stripApolloContactFields,
} from "../../../../supabase/functions/_shared/intent-phase2-domain";
import {
  dedupeActivities,
  normalizeProfileActivityItem,
} from "../../../../supabase/functions/_shared/intent-activity";
import { validateSignalJudgment } from "../../../../supabase/functions/_shared/intent-signal-llm";

const buyer = {
  cargos: ["Diretor de Marketing", "Head of Marketing"],
  senioridades: ["director", "head"],
  setores: [{ familia: "tecnologia", label_linkedin: "Software" }],
  portes: ["51-200"],
  regioes: ["Brasil"],
  exclusoes: [
    { tipo: "open_to_work", valor: "Open to Work", motivo: "Fora do recorte" },
    { tipo: "concorrente", valor: "Concorrente Ltda", motivo: "Concorrente" },
  ],
};

describe("Phase 2 people-first contracts", () => {
  it("always applies Brazil to both person and company search", () => {
    expect(buildApolloPeopleSearchInput(buyer, 50)).toEqual(expect.objectContaining({
      person_locations: ["Brazil"],
      organization_locations: ["Brazil"],
      per_page: 10,
      organization_num_employees_ranges: ["51,200"],
    }));
  });

  it("deduplicates Apollo identifiers and rejects missing identifiers", () => {
    expect(apolloSearchPersonIds({ people: [{ person_id: "a" }, { id: "a" }, {}, { id: "b" }] })).toEqual(["a", "b"]);
  });

  it("requires a literal Brazilian country and a public LinkedIn profile", () => {
    const base = {
      person: {
        id: "person-1",
        name: "Pessoa Exemplo",
        linkedin_url: "https://www.linkedin.com/in/pessoa-exemplo",
        country: "Brazil",
        title: "Diretor de Marketing",
        seniority: "director",
        organization: { name: "Empresa Exemplo", industry: "Software", estimated_num_employees: 120 },
      },
    };
    expect(normalizeEnrichedApolloPerson(base)?.country).toBe("Brazil");
    expect(normalizeEnrichedApolloPerson({ person: { ...base.person, country: null } })).toBeNull();
    expect(normalizeEnrichedApolloPerson({ person: { ...base.person, country: "Portugal" } })).toBeNull();
  });

  it("keeps fit internal and applies explicit exclusions", () => {
    const candidate = normalizeEnrichedApolloPerson({
      person: {
        id: "person-1",
        name: "Pessoa Exemplo",
        linkedin_url: "https://www.linkedin.com/in/pessoa-exemplo",
        country: "Brazil",
        title: "Diretor de Marketing",
        seniority: "director",
        organization: { name: "Empresa Exemplo", industry: "Software", estimated_num_employees: 120 },
      },
    })!;
    expect(assessApolloFit(candidate, buyer)).toEqual({
      score: 100,
      excluded: false,
      reasons: ["Brasil confirmado pelo enriquecimento regional", "cargo aderente", "senioridade aderente", "setor aderente", "porte aderente"],
    });
    expect(assessApolloFit({ ...candidate, company: { ...candidate.company!, name: "Concorrente Ltda" } }, buyer).excluded).toBe(true);
  });

  it("removes contact fields recursively before auditing Apollo payloads", () => {
    const safe = stripApolloContactFields({
      person: { name: "Pessoa", email: "private@example.com", phone_numbers: ["123"], organization: { name: "Empresa" } },
      contact_data: { mobile: "123" },
    });
    expect(JSON.stringify(safe)).toBe('{"person":{"name":"Pessoa","organization":{"name":"Empresa"}}}');
  });

  it("groups all activities from one person cycle under one credit reference", () => {
    expect(buildPersonJudgmentPayload("person-1", ["candidate-a", "candidate-a", "candidate-b"], "watch-1")).toEqual({
      pessoa_id: "person-1",
      candidato_ids: ["candidate-a", "candidate-b"],
      vigilia_job_id: "watch-1",
    });
    expect(personJudgmentCreditReference("person-1", "watch-1")).toBe("pessoa_julgada:person-1:watch-1");
  });

  it("targets the exact company before expanding the radar", () => {
    expect(buildApolloCompanyPeopleSearchInput(buyer, {
      apolloId: "org-1",
      domain: "empresa.com.br",
      name: "Empresa",
    }, 5)).toEqual(expect.objectContaining({
      organization_ids: ["org-1"],
      person_locations: ["Brazil"],
      organization_locations: ["Brazil"],
      per_page: 5,
    }));
    expect(buildApolloCompanyPeopleSearchInput(buyer, {
      apolloId: null,
      domain: "https://www.empresa.com.br/sobre",
      name: "Empresa",
    }, 5)).toEqual(expect.objectContaining({
      q_organization_domains_list: ["empresa.com.br"],
    }));
  });

  it("rejects an enriched person attached to another company", () => {
    const candidate = normalizeEnrichedApolloPerson({
      person: {
        id: "person-2",
        name: "Pessoa Dois",
        linkedin_url: "https://www.linkedin.com/in/pessoa-dois",
        country: "Brazil",
        title: "Diretor de Marketing",
        organization: { id: "org-2", name: "Outra Empresa", primary_domain: "outra.com.br" },
      },
    })!;
    expect(candidateBelongsToCompany(candidate, { apolloId: "org-1", domain: "empresa.com.br", name: "Empresa" })).toBe(false);
    expect(candidateBelongsToCompany(candidate, { apolloId: null, domain: "outra.com.br", name: "Outra Empresa" })).toBe(true);
  });
});

describe("Phase 2 public activity normalization", () => {
  it("normalizes a primary comment while preserving literal evidence", () => {
    expect(normalizeProfileActivityItem({
      id: "comment-1",
      commentary: "Estamos avaliando essa solução neste trimestre.",
      createdAt: "2026-08-17T10:00:00Z",
      postUrl: "https://www.linkedin.com/posts/example_activity-123",
      postText: "Como reduzir o custo operacional",
    }, "comment")).toEqual(expect.objectContaining({
      type: "comment",
      externalId: "comment-1",
      evidence: "Estamos avaliando essa solução neste trimestre.",
      context: "Como reduzir o custo operacional",
    }));
  });

  it("normalizes the approved fallback date and rejects typed provider errors", () => {
    const fallback = normalizeProfileActivityItem({
      sourceType: "reaction",
      eventDate: "2026-08-17 10:00:00",
      content: "Conteúdo do post observado",
      action: "curtiu",
      postUrl: "https://www.linkedin.com/posts/example_activity-456",
    }, "reaction");
    expect(fallback?.occurredAt).toBe("2026-08-17T10:00:00.000Z");
    expect(normalizeProfileActivityItem({ sourceType: "error", message: "profile unavailable" }, "reaction")).toBeNull();
  });

  it("does not accept activity without evidence, timestamp or a LinkedIn source", () => {
    expect(normalizeProfileActivityItem({ id: "x", commentary: "texto" }, "comment")).toBeNull();
    expect(normalizeProfileActivityItem({ commentary: "texto", createdAt: "2026-08-17", postUrl: "https://example.com/post" }, "comment")).toBeNull();
  });

  it("deduplicates retries by normalized event identity", () => {
    const item = normalizeProfileActivityItem({
      id: "comment-1",
      commentary: "Evidência literal",
      createdAt: "2026-08-17T10:00:00Z",
      postUrl: "https://www.linkedin.com/posts/example_activity-123",
    }, "comment")!;
    expect(dedupeActivities([item, item])).toHaveLength(1);
  });
});

describe("Phase 2 intent judgment", () => {
  it("accepts only an ICP rule and literal captured evidence", () => {
    expect(validateSignalJudgment({
      nota: 88,
      regra_que_bateu: "Dor declarada",
      evidencia_citada: "avaliando essa solução",
    }, "Estamos avaliando essa solução neste trimestre.", ["Dor declarada"])).toEqual({
      nota: 88,
      regra_que_bateu: "Dor declarada",
      evidencia_citada: "avaliando essa solução",
    });
  });

  it("rejects invented evidence, unknown rules and extra fields", () => {
    expect(() => validateSignalJudgment({ nota: 80, regra_que_bateu: "Regra inventada", evidencia_citada: "texto" }, "texto literal", ["Dor declarada"])).toThrow(/fora do perfil ideal/);
    expect(() => validateSignalJudgment({ nota: 80, regra_que_bateu: "Dor declarada", evidencia_citada: "orçamento aprovado" }, "texto literal", ["Dor declarada"])).toThrow(/não existe literalmente/);
    expect(() => validateSignalJudgment({ nota: 80, regra_que_bateu: "nenhuma", evidencia_citada: "texto", resumo: "extra" }, "texto literal", ["Dor declarada"])).toThrow(/campos incompatíveis/);
  });
});
