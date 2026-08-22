import { describe, expect, it } from "vitest"
import {
  hasIntentV2LiteralProof,
  statusForIntentV2Level,
  validateIntentV2Level,
  validateIntentV2Relevance,
} from "./intent-v2-judgment.ts"

describe("julgamento IA2/IA3 do Intent v2", () => {
  it("aceita somente o contrato de relevância e uma prova curta", () => {
    expect(validateIntentV2Relevance({
      relevante: true,
      porque: "A pessoa descreve uma dor do perfil ideal.",
      frase_prova: "precisamos modernizar a arquitetura",
    })).toMatchObject({ relevante: true })
    expect(() => validateIntentV2Relevance({ relevante: true, porque: "ok", frase_prova: "prova", nota: 91 })).toThrow("contrato")
  })

  it("exige prova literal no comentário ou no post, sem aceitar paráfrase", () => {
    expect(hasIntentV2LiteralProof("precisamos modernizar a arquitetura", "Estamos travados: precisamos modernizar a arquitetura", null)).toBe(true)
    expect(hasIntentV2LiteralProof("precisamos atualizar a arquitetura", "Estamos travados: precisamos modernizar a arquitetura", null)).toBe(false)
    expect(hasIntentV2LiteralProof("governança de dados", "Comentário curto", "O desafio é governança de dados em escala")).toBe(true)
  })

  it("mapeia o nível sem score numérico", () => {
    expect(validateIntentV2Level({ nivel: "forte", porque: "Dor atual declarada." })).toEqual({ nivel: "forte", porque: "Dor atual declarada." })
    expect(statusForIntentV2Level("forte")).toBe("lead")
    expect(statusForIntentV2Level("media")).toBe("sinal_fraco")
    expect(statusForIntentV2Level("fraca")).toBe("vigiado")
  })
})
