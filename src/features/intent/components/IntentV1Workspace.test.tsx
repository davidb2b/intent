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
  loadSignalSummary: vi.fn().mockResolvedValue({
    projectId: "project-1",
    monthlyCostUsd: 0.11,
    creditsUsed: 12,
    creditsReserved: 0,
    creditsLimit: 500,
    executionHistory: [],
  }),
  loadSignalPeople: vi.fn().mockResolvedValue([{ id: "person-1", name: "Mariana Silva", role: "CTO", headline: null, companyName: "Acme cliente", companySector: "Tecnologia", companySize: "201-500", linkedinUrl: "https://www.linkedin.com/in/mariana", seniority: "diretoria", icp: true, icpReason: "Cargo, setor e porte correspondem ao perfil ideal ativo.", comments: 2, signalCount: 2, signalTypes: ["comentou_tema"], priorityScore: 84, priorityBucket: "alta", priorityLabel: "Prioridade alta", emailAvailable: false, phoneAvailable: false, intentScore: 82, intentStatus: "lead", lastSignalAt: "2026-08-18", createdAt: "2026-08-18" }]),
  loadSignalCompanies: vi.fn().mockResolvedValue([{ id: "company-1", name: "Acme cliente", sector: "Tecnologia", size: "201-500", linkedinUrl: "https://www.linkedin.com/company/acme", people: 1, comments: 2, signalSummary: "CTO comentou sobre tema do ICP", level: "aquecendo" }]),
  loadSignalSources: vi.fn().mockResolvedValue([{ id: "source-1", name: "Fonte aprovada", linkedinUrl: "https://www.linkedin.com/in/fonte", status: "candidata", posts: 4, comments: 2, reactions: 3, ratio: 1, people: 1, icp: 1, yield: 1, previewPost: null, kind: "pessoa" }]),
  loadIntentSignalEvidence: vi.fn().mockResolvedValue([{ id: "comment-1", personId: "person-1", text: "Quero entender melhor esta solução.", publishedAt: "2026-08-18", tone: "pergunta", personName: "Mariana Silva", personHeadline: "CTO", companyName: "Acme cliente", personUrl: "https://www.linkedin.com/in/mariana", postUrl: "https://www.linkedin.com/posts/mariana", confidence: 0.9, signalType: "comentou_tema", rule: "Busca ativa" }]),
}))

vi.mock("@/features/intent/services/reveal-contact", () => ({
  revealContact: vi.fn().mockResolvedValue({ status: "revealed", cached: false, type: "email", contact: "mariana@acme.com.br" }),
}))

vi.mock("@/features/classification/services/preview-signal", () => ({
  previewSignal: vi.fn().mockResolvedValue({
    status: "lead",
    fit: { cargo: "confirmado", porte: "confirmado", resumo: "Cargo e porte informados correspondem ao perfil ideal ativo." },
    judgment: { score: 91, rule: "Busca ativa", evidence: "Quero avaliar uma solução para este problema." },
    costUsd: 0.01,
    saved: false,
  }),
}))

vi.mock("@/features/collection/services/update-source-status", () => ({
  updateSourceStatus: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/features/people/services/mark-person-client", () => ({
  markPersonAsClient: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/features/intent/services/send-person-to-crm", () => ({
  sendPersonToCrm: vi.fn().mockResolvedValue({ status: "delivered" }),
}))

describe("IntentV1Workspace", () => {
  afterEach(() => cleanup())

  it("uses the people-first V1 workspace after authentication", async () => {
    render(<IntentV1Workspace session={{ email: "gabriel@acme.com.br", userId: "user-1" }} />)

    expect(await screen.findByRole("heading", { name: "Início" })).toBeInTheDocument()
    expect(screen.getByText("Quem merece sua atenção hoje")).toBeInTheDocument()
    expect(screen.queryByText("Termo monitorado")).not.toBeInTheDocument()
    expect(screen.queryByText("Configurar pesquisa")).not.toBeInTheDocument()
  })

  it("navigates through people, accounts, watchlist and ICP without legacy routes", async () => {
    render(<IntentV1Workspace session={{ email: "gabriel@acme.com.br", userId: "user-1" }} />)
    await screen.findByRole("heading", { name: "Início" })

    fireEvent.click(screen.getByRole("button", { name: /Pessoas/ }))
    expect(screen.getByRole("heading", { level: 1, name: "Pessoas" })).toBeInTheDocument()
    expect(screen.getByText("Mariana Silva")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Contas/ }))
    expect(screen.getByRole("heading", { level: 1, name: "Contas" })).toBeInTheDocument()
    expect(screen.getAllByRole("heading", { name: "Contas" })).toHaveLength(1)
    expect(screen.getByText("Visão por empresa. Quando mais de uma pessoa da mesma empresa aparece, a conta é marcada como em movimento.")).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "Empresa" })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "Pessoas" })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "Sinais" })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "Nível" })).toBeInTheDocument()
    expect(screen.getByText("201-500 · Tecnologia")).toBeInTheDocument()
    expect(screen.getByText("CTO comentou sobre tema do ICP")).toBeInTheDocument()
    expect(screen.getByText("Aquecendo")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Watchlist/ }))
    expect(screen.getByRole("heading", { level: 1, name: "Watchlist" })).toBeInTheDocument()
    expect(screen.getByText("Fonte aprovada")).toBeInTheDocument()
  })

  it("asks for visible confirmation before consulting a contact", async () => {
    render(<IntentV1Workspace session={{ email: "gabriel@acme.com.br", userId: "user-1" }} />)
    await screen.findByRole("heading", { name: "Início" })

    fireEvent.click(screen.getByRole("button", { name: /Pessoas/ }))
    fireEvent.click(screen.getByRole("row", { name: "Abrir detalhes de Mariana Silva" }))
    fireEvent.click(screen.getByRole("button", { name: "Revelar e-mail · 1 crédito" }))
    expect(screen.getByText("Revelar e-mail de Mariana Silva?")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Confirmar consulta" }))
    expect(await screen.findByText("mariana@acme.com.br ✓")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Revelar telefone · 10 créditos" })).toBeInTheDocument()
  })

  it("opens the prototype-aligned evidence drawer from the entire row", async () => {
    render(<IntentV1Workspace session={{ email: "gabriel@acme.com.br", userId: "user-1" }} />)
    await screen.findByRole("heading", { name: "Início" })

    fireEvent.click(screen.getByRole("button", { name: /Pessoas/ }))
    expect(screen.queryByRole("columnheader", { name: "Contato" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("row", { name: "Abrir detalhes de Mariana Silva" }))
    expect(screen.getByRole("dialog", { name: "Detalhes de Mariana Silva" })).toBeInTheDocument()
    expect(screen.getByText("Intenção · forte")).toBeInTheDocument()
    expect(screen.getAllByText("⚡ 82").length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText("Cargo, setor e porte correspondem ao perfil ideal ativo.")).toBeInTheDocument()
    expect(screen.getByText("Busca ativa")).toBeInTheDocument()
    expect(screen.getAllByText("Quero entender melhor esta solução.").length).toBeGreaterThanOrEqual(2)
  })

  it("supports keyboard access and preserves a client decision", async () => {
    render(<IntentV1Workspace session={{ email: "gabriel@acme.com.br", userId: "user-1" }} />)
    await screen.findByRole("heading", { name: "Início" })

    fireEvent.click(screen.getByRole("button", { name: /Pessoas/ }))
    fireEvent.keyDown(screen.getByRole("row", { name: "Abrir detalhes de Mariana Silva" }), { key: "Enter" })
    expect(screen.getByRole("dialog", { name: "Detalhes de Mariana Silva" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Marcar como cliente" }))
    expect((await screen.findAllByText("Cliente")).length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByRole("dialog", { name: "Detalhes de Mariana Silva" })).not.toBeInTheDocument()
  })

  it("approves a watchlist source through the real status service", async () => {
    render(<IntentV1Workspace session={{ email: "gabriel@acme.com.br", userId: "user-1" }} />)
    await screen.findByRole("heading", { name: "Início" })

    fireEvent.click(screen.getByRole("button", { name: /Watchlist/ }))
    expect(screen.getByText("Sugestão")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Aprovar" }))
    expect(await screen.findByText("Acompanhando")).toBeInTheDocument()
  })

  it("shows the real classification test without prototype samples", async () => {
    render(<IntentV1Workspace session={{ email: "gabriel@acme.com.br", userId: "user-1" }} />)
    await screen.findByRole("heading", { name: "Início" })

    fireEvent.click(screen.getByRole("button", { name: "Testar classificação" }))
    expect(screen.getByRole("heading", { level: 1, name: "Testar classificação" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /exemplo|amostra/i })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Evidência pública"), { target: { value: "Quero avaliar uma solução para este problema." } })
    fireEvent.click(screen.getByRole("button", { name: "Classificar evidência" }))
    expect(await screen.findByText("Avaliação concluída")).toBeInTheDocument()
    expect(screen.getByText("91% de intenção")).toBeInTheDocument()
  })

  it("keeps provider costs outside the customer workspace and shows plan credits", async () => {
    render(<IntentV1Workspace session={{ email: "gabriel@acme.com.br", userId: "user-1" }} />)
    await screen.findByRole("heading", { name: "Início" })

    expect(screen.queryByRole("button", { name: /Custos/ })).not.toBeInTheDocument()
    expect(screen.getByText("12 / 500")).toBeInTheDocument()
    expect(screen.queryByText(/US\$/)).not.toBeInTheDocument()
  })
})
