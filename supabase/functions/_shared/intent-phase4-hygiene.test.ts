import { describe, expect, it } from "vitest"
import { assessCommentForIntent, extractIntentSignalTerms } from "./intent-phase4-hygiene.ts"

describe("higiene de comentários do Intent", () => {
  it("preserva termos do contrato v2 e do contrato v1", () => {
    expect(extractIntentSignalTerms({ termos: ["arquitetura", "IA"] })).toEqual(["arquitetura", "IA"])
    expect(extractIntentSignalTerms({ regras: [{ palavras_chave: ["governança", "integração"] }] })).toEqual(["governança", "integração"])
  })

  it("não libera comentário sem texto público do post", () => {
    expect(
      assessCommentForIntent({ comment: "Precisamos melhorar a arquitetura", postText: null, terms: ["arquitetura"] }),
    ).toEqual({ decision: "awaiting_post_context", reason: "contexto_post_ausente", matchedTerms: [] })
  })

  it("descarta cortesia e aprova contexto literal aderente", () => {
    expect(
      assessCommentForIntent({ comment: "Parabéns, excelente!", postText: "Arquitetura de software", terms: ["arquitetura"] }).decision,
    ).toBe("discarded")
    expect(
      assessCommentForIntent({ comment: "Estamos com esse desafio", postText: "Modernização da arquitetura e governança", terms: ["governança"] }),
    ).toEqual({ decision: "approved", reason: null, matchedTerms: ["governança"] })
  })
})
