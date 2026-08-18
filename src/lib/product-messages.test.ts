import { describe, expect, it } from "vitest"

import { authErrorMessage, onboardingNotice, productErrorMessage, productStatusMessage } from "./product-messages"

describe("product messages", () => {
  it("never exposes infrastructure details", () => {
    expect(productErrorMessage("function digest(text, unknown) does not exist", "Não conseguimos concluir a etapa.")).toBe(
      "Encontramos uma instabilidade ao concluir esta etapa. Nenhuma alteração foi perdida; tente novamente em alguns instantes.",
    )
    expect(productErrorMessage("O Actor apify/google-search-scraper não iniciou (400).", "Não conseguimos concluir a análise.")).toBe(
      "Não conseguimos concluir a análise.",
    )
    expect(productErrorMessage("Edge Function returned a non-2xx status code", "Não conseguimos concluir a análise.")).toBe(
      "Não conseguimos concluir a análise.",
    )
    expect(productErrorMessage("duplicate key value violates unique constraint", "Não conseguimos salvar sua alteração.")).toBe(
      "Encontramos uma instabilidade ao concluir esta etapa. Nenhuma alteração foi perdida; tente novamente em alguns instantes.",
    )
  })

  it("turns authentication failures into useful guidance", () => {
    expect(authErrorMessage("Invalid login credentials")).toBe("E-mail ou senha não conferem. Revise os dados e tente novamente.")
  })

  it("translates old validation records into product guidance", () => {
    expect(productErrorMessage("Uma prova social não foi encontrada literalmente na fonte informada.", "Não conseguimos concluir.")).toBe(
      "Uma informação não pôde ser confirmada na fonte original. Revise o perfil antes de continuar.",
    )
    expect(productErrorMessage("Brasil é obrigatório no ICP da V1.", "Não conseguimos concluir.")).toBe(
      "Para manter a pesquisa alinhada ao mercado brasileiro, inclua Brasil na região do perfil ideal.",
    )
  })

  it("summarizes technical onboarding warnings as a review notice", () => {
    expect(onboardingNotice("O Actor falhou. A company page do LinkedIn não foi confirmada. Provas sociais sem correspondência literal foram descartadas.")).toBe(
      "Alguns dados da empresa não puderam ser confirmados nas fontes públicas. Informações sem confirmação literal foram deixadas de fora para manter a análise confiável.",
    )
  })

  it("replaces old technical progress messages with product language", () => {
    expect(productStatusMessage("Company page encontrada. Confirmando a firmografia.", "Analisando sua empresa.")).toBe(
      "Perfil público encontrado. Confirmando os dados da empresa.",
    )
    expect(productStatusMessage("Running Actor dataset", "Analisando sua empresa.")).toBe("Analisando sua empresa.")
  })
})
