import { describe, expect, it } from "vitest"

import { authErrorMessage, onboardingNotice, productErrorMessage, productStatusMessage } from "./product-messages"

describe("product messages", () => {
  it("never exposes infrastructure details", () => {
    expect(productErrorMessage("function digest(text, unknown) does not exist", "Não conseguimos concluir a etapa.")).toBe(
      "Não conseguimos concluir esta etapa. Nenhuma alteração foi perdida; tente novamente em alguns instantes.",
    )
    expect(productErrorMessage("O Actor apify/google-search-scraper não iniciou (400).", "Não conseguimos concluir a análise.")).toBe(
      "Não conseguimos concluir a análise.",
    )
    expect(productErrorMessage("Edge Function returned a non-2xx status code", "Não conseguimos concluir a análise.")).toBe(
      "Não conseguimos concluir a análise.",
    )
    expect(productErrorMessage("duplicate key value violates unique constraint", "Não conseguimos salvar sua alteração.")).toBe(
      "Não conseguimos concluir esta etapa. Nenhuma alteração foi perdida; tente novamente em alguns instantes.",
    )
  })

  it("turns access and availability failures into clear next steps", () => {
    expect(productErrorMessage("Invalid JWT: token expired", "Não conseguimos carregar.")).toBe(
      "Sua sessão expirou. Entre novamente para continuar com segurança.",
    )
    expect(productErrorMessage("new row violates row-level security policy", "Não conseguimos salvar.")).toBe(
      "Seu acesso não permite concluir esta ação. Se isso parecer incorreto, fale com o responsável pela conta.",
    )
    expect(productErrorMessage("Execution already running", "Não conseguimos atualizar.")).toBe(
      "Uma atualização já está em andamento. Você pode continuar usando seus resultados enquanto ela termina.",
    )
    expect(productErrorMessage("OPENAI_API_KEY is not configured", "Não conseguimos avaliar.")).toBe(
      "Este recurso está temporariamente indisponível. Seus dados foram preservados; tente novamente mais tarde.",
    )
  })

  it("explains CRM configuration and contact availability in product language", () => {
    expect(productErrorMessage("A integração com o CRM ainda não foi configurada para esta conta.", "Não conseguimos enviar.")).toBe(
      "O envio ao CRM ainda não está disponível nesta conta. Fale com o responsável pela operação para conectar o destino.",
    )
    expect(productErrorMessage("Nenhum contato foi disponibilizado para este perfil. Nenhum crédito foi consumido.", "Não conseguimos consultar.")).toBe(
      "Não encontramos um contato confirmado para este perfil. Nenhum crédito foi consumido.",
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
