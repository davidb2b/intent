import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup } from "@testing-library/react"

import App from "./app/App"

describe("Intent foundation", () => {
  afterEach(() => cleanup())

  it("shows the V1 access screen instead of the legacy research shell when signed out", async () => {
    render(<App />)

    expect(await screen.findByRole("heading", { name: "Bem-vindo ao Intent" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Entrar no Intent" })).toBeInTheDocument()
    expect(screen.queryByText("Sua próxima oportunidade começa com um tema")).not.toBeInTheDocument()
  })

  it("does not expose legacy navigation or research controls before authentication", async () => {
    render(<App />)

    expect(await screen.findByRole("heading", { name: "Bem-vindo ao Intent" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Atualizar agora/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Posts" })).not.toBeInTheDocument()
  })

  it("offers password recovery and password visibility controls", async () => {
    render(<App />)
    await screen.findByRole("button", { name: "Entrar no Intent" })
    expect(screen.getByRole("button", { name: "Mostrar senha" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Esqueci minha senha" }))

    expect(screen.getByRole("heading", { name: "Recupere seu acesso" })).toBeInTheDocument()
    expect(screen.queryByLabelText("Senha")).not.toBeInTheDocument()
  })
})
