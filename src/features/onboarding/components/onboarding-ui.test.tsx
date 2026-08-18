import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { OnboardingProgress } from "./OnboardingProgress"
import { OnboardingStart } from "./OnboardingStart"
import { EditableList } from "./EditableList"

describe("Intent onboarding UI", () => {
  afterEach(cleanup)

  it("starts the real analysis with a normalized domain", async () => {
    const onStart = vi.fn().mockResolvedValue(undefined)
    render(<OnboardingStart busy={false} onStart={onStart} />)
    fireEvent.change(screen.getByLabelText("Site da empresa"), { target: { value: "b2binsiders.com.br" } })
    fireEvent.click(screen.getByRole("button", { name: /Criar perfil ideal/ }))
    expect(onStart).toHaveBeenCalledWith("https://b2binsiders.com.br/")
  })

  it("renders the current analysis stage without a skip action", () => {
    render(<OnboardingProgress domain="b2binsiders.com.br" execution={{ id: "execution-1", status: "rodando", stage: "market", progress: 42, message: "Perfil público encontrado. Confirmando os dados da empresa.", error: null, costUsd: 0.02 }} />)
    expect(screen.getByRole("heading", { name: "Conhecendo b2binsiders.com.br" })).toBeInTheDocument()
    expect(screen.getAllByText("Perfil público encontrado. Confirmando os dados da empresa.").length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: /Pular/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText("Progresso da análise: 42%")).toBeInTheDocument()
  })

  it("makes an active ICP list visibly immutable", () => {
    render(<EditableList disabled label="Cargos" onChange={vi.fn()} values={["CTO"]} />)
    expect(screen.getByRole("button", { name: "Remover CTO" })).toBeDisabled()
    expect(screen.queryByLabelText("Novo item em Cargos")).not.toBeInTheDocument()
  })
})
