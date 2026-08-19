import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup } from "@testing-library/react"

import { IntentV1Workspace } from "./IntentV1Workspace"

vi.mock("@/features/onboarding/services/onboarding-service", () => ({
  loadOnboardingWorkspace: vi.fn().mockResolvedValue({
    project: { id: "project-1", name: "Acme", domain: "acme.com.br", monthlyCredits: 500, onboardingStatus: "concluido", onboardingWarning: null },
    latestIcp: { id: "icp-1", version: 1, status: "ativo", companySummary: "Empresas brasileiras de tecnologia.", projectId: "project-1", company: {}, buyer: {}, buyingSignals: {}, costUsd: 0, createdAt: "2026-08-18", activatedAt: "2026-08-18" },
    activeIcp: { id: "icp-1", version: 1, status: "ativo", companySummary: "Empresas brasileiras de tecnologia.", projectId: "project-1", company: {}, buyer: {}, buyingSignals: {}, costUsd: 0, createdAt: "2026-08-18", activatedAt: "2026-08-18" },
    execution: null,
  }),
}))

vi.mock("@/features/analytics/services/load-signals", () => ({
  loadSignalSummary: vi.fn().mockResolvedValue({ projectId: "project-1", monthlyCostUsd: 0.11 }),
  loadSignalPeople: vi.fn().mockResolvedValue([{ id: "person-1", name: "Mariana Silva", role: "CTO", headline: null, companyName: "Acme cliente", linkedinUrl: "https://www.linkedin.com/in/mariana", seniority: "diretoria", icp: true, icpReason: null, comments: 2, emailAvailable: false, phoneAvailable: false }]),
  loadSignalCompanies: vi.fn().mockResolvedValue([{ id: "company-1", name: "Acme cliente", sector: "Tecnologia", size: "201-500", linkedinUrl: "https://www.linkedin.com/company/acme", people: 1, comments: 2 }]),
  loadSignalSources: vi.fn().mockResolvedValue([{ id: "source-1", name: "Fonte aprovada", linkedinUrl: "https://www.linkedin.com/in/fonte", status: "monitorada", posts: 4, comments: 2, reactions: 3, ratio: 1, people: 1, icp: 1, yield: 1, previewPost: null }]),
}))

vi.mock("@/features/intent/services/reveal-contact", () => ({
  revealContact: vi.fn().mockResolvedValue({ status: "revealed", cached: false, type: "email", contact: "mariana@acme.com.br" }),
}))

describe("IntentV1Workspace", () => {
  afterEach(() => cleanup())

  it("uses the people-first V1 workspace after authentication", async () => {
    render(<IntentV1Workspace session={{ email: "gabriel@acme.com.br", userId: "user-1" }} />)

    expect(await screen.findByRole("heading", { name: "Início" })).toBeInTheDocument()
    expect(screen.getByText("Onde sua próxima oportunidade está aparecendo")).toBeInTheDocument()
    expect(screen.queryByText("Termo monitorado")).not.toBeInTheDocument()
    expect(screen.queryByText("Configurar pesquisa")).not.toBeInTheDocument()
  })

  it("navigates through people, accounts, watchlist and ICP without legacy routes", async () => {
    render(<IntentV1Workspace session={{ email: "gabriel@acme.com.br", userId: "user-1" }} />)
    await screen.findByRole("heading", { name: "Início" })

    fireEvent.click(screen.getByRole("button", { name: /Pessoas/ }))
    expect(screen.getByRole("heading", { level: 1, name: "Pessoas" })).toBeInTheDocument()
    expect(screen.getByText("Mariana Silva")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Watchlist/ }))
    expect(screen.getByRole("heading", { level: 1, name: "Watchlist" })).toBeInTheDocument()
    expect(screen.getByText("Fonte aprovada")).toBeInTheDocument()
  })

  it("asks for visible confirmation before consulting a contact", async () => {
    render(<IntentV1Workspace session={{ email: "gabriel@acme.com.br", userId: "user-1" }} />)
    await screen.findByRole("heading", { name: "Início" })

    fireEvent.click(screen.getByRole("button", { name: /Pessoas/ }))
    fireEvent.click(screen.getByRole("button", { name: "Consultar e-mail" }))
    expect(screen.getByText("Consultar e-mail de Mariana Silva?")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Confirmar consulta" }))
    expect(await screen.findByText("mariana@acme.com.br")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Consultar telefone" })).toBeInTheDocument()
  })
})
