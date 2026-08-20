import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { IntentWorkspaceShell } from "./IntentWorkspaceShell"

describe("IntentWorkspaceShell", () => {
  it("does not expose disabled legacy navigation or technical placeholder copy", () => {
    render(
      <IntentWorkspaceShell active project={{ id: "project-1", name: "Acme", domain: "acme.com.br", monthlyCredits: 500, siteUrl: "https://acme.com.br", onboardingStatus: "concluido", onboardingWarning: null }} version={2}>
        <p>Conteúdo do perfil ideal</p>
      </IntentWorkspaceShell>,
    )

    expect(screen.getByRole("button", { name: /Perfil ideal/ })).toBeEnabled()
    expect(screen.queryByText("Em breve")).not.toBeInTheDocument()
    expect(screen.queryByTitle("Disponível em breve")).not.toBeInTheDocument()
    expect(screen.getByText("Conteúdo do perfil ideal")).toBeInTheDocument()
  })
})
