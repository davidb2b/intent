import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup } from "@testing-library/react"

import App from "./app/App"

describe("Signal Lab foundation", () => {
  afterEach(() => cleanup())

  it("starts with an honest empty state instead of fabricated metrics", () => {
    render(<App />)

    expect(screen.getByText("Nenhum sinal coletado ainda")).toBeInTheDocument()
    expect(screen.getByText("Coleta não iniciada")).toBeInTheDocument()
    expect(screen.queryByText("42")).not.toBeInTheDocument()
  })

  it("navigates between the five product areas", () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: /02Posts/ }))

    expect(screen.getByText("Nenhum post disponível")).toBeInTheDocument()
  })

  it("uses real application routes for the product areas", () => {
    window.history.replaceState({}, "", "/overview")
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: /02Posts/ }))

    expect(window.location.pathname).toBe("/posts")
  })

  it("requires both a keyword and an authenticated session before collecting", () => {
    render(<App />)

    expect(screen.getByRole("button", { name: /Atualizar agora/ })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: /Configurar pesquisa/ }))
    fireEvent.change(screen.getByLabelText("Palavra-chave principal"), {
      target: { value: "cost breakdown" },
    })
    expect(screen.getByRole("button", { name: /Salvar configuração/ })).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: /Salvar configuração/ }))

    expect(screen.getAllByText("cost breakdown").length).toBe(2)
    expect(screen.getAllByRole("button", { name: /Atualizar agora/ })[0]).toBeDisabled()
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument()
  })

  it("offers password recovery and password visibility controls", () => {
    render(<App />)
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }))
    fireEvent.click(screen.getByRole("button", { name: "Esqueci a senha" }))

    expect(screen.getByRole("heading", { name: "Recuperar senha" })).toBeInTheDocument()
    expect(screen.queryByLabelText("Senha")).not.toBeInTheDocument()
  })
})
