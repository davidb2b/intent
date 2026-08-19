import { useEffect, useMemo, useState } from "react"
import { Building2, ChevronRight, CircleAlert, Eye, Home, LayoutList, LoaderCircle, LogOut, Mail, Phone, Target, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { authService } from "@/features/auth/services/auth-service"
import { loadSignalCompanies, loadSignalPeople, loadSignalSources, loadSignalSummary, type SignalCompany, type SignalPerson, type SignalSource, type SignalSummary } from "@/features/analytics/services/load-signals"
import { loadOnboardingWorkspace } from "@/features/onboarding/services/onboarding-service"
import type { IcpRecord, OnboardingWorkspace } from "@/features/onboarding/domain/onboarding"
import { productErrorMessage } from "@/lib/product-messages"
import { revealContact, type RevealContactType } from "@/features/intent/services/reveal-contact"

import "./intent-v1-workspace.css"
import "./intent-v1-contact.css"

type WorkspaceView = "inicio" | "pessoas" | "contas" | "watchlist" | "icp"
type Session = { email: string; userId: string }

const items: Array<{ id: WorkspaceView; label: string; icon: typeof Home }> = [
  { id: "inicio", label: "Início", icon: Home },
  { id: "pessoas", label: "Pessoas", icon: Users },
  { id: "contas", label: "Contas", icon: Building2 },
  { id: "watchlist", label: "Watchlist", icon: Eye },
  { id: "icp", label: "ICP", icon: Target },
]

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "IN"
}

function personSubline(person: SignalPerson) {
  return [person.role ?? person.headline, person.companyName].filter(Boolean).join(" · ") || "Perfil público identificado"
}

function IcpStatus({ icp }: { icp: IcpRecord | null | undefined }) {
  return <span className={`intent-v1-status ${icp?.status === "ativo" ? "is-active" : ""}`}>{icp?.status === "ativo" ? `ICP v${icp.version} ativo` : "ICP em revisão"}</span>
}

export function IntentV1Workspace({ session }: { session: Session }) {
  const [view, setView] = useState<WorkspaceView>("inicio")
  const [workspace, setWorkspace] = useState<OnboardingWorkspace | null>(null)
  const [summary, setSummary] = useState<SignalSummary | null>(null)
  const [people, setPeople] = useState<SignalPerson[]>([])
  const [companies, setCompanies] = useState<SignalCompany[]>([])
  const [sources, setSources] = useState<SignalSource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [revealRequest, setRevealRequest] = useState<{ person: SignalPerson; type: RevealContactType } | null>(null)
  const [revealing, setRevealing] = useState(false)
  const [revealedContact, setRevealedContact] = useState<{ personId: string; type: RevealContactType; value: string } | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const nextWorkspace = await loadOnboardingWorkspace(session.userId)
        const nextSummary = await loadSignalSummary(session.userId)
        const projectId = nextSummary.projectId ?? nextWorkspace.project.id
        const [nextPeople, nextCompanies, nextSources] = await Promise.all([
          loadSignalPeople(projectId),
          loadSignalCompanies(projectId),
          loadSignalSources(projectId),
        ])
        if (!active) return
        setWorkspace(nextWorkspace)
        setSummary(nextSummary)
        setPeople(nextPeople)
        setCompanies(nextCompanies)
        setSources(nextSources)
      } catch (caught) {
        if (active) setError(productErrorMessage(caught, "Não conseguimos carregar sua operação agora. Seus dados continuam protegidos; tente atualizar em alguns instantes."))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [session.userId])

  const activeIcp = workspace?.activeIcp
  const monitoredSources = useMemo(() => sources.filter((source) => source.status === "monitorada"), [sources])
  const candidates = useMemo(() => sources.filter((source) => source.status === "candidata"), [sources])
  const visiblePeople = useMemo(() => people.filter((person) => person.icp !== false), [people])

  async function confirmContactReveal() {
    if (!revealRequest || !workspace) return
    setRevealing(true)
    setError("")
    try {
      const result = await revealContact({ projectId: workspace.project.id, personId: revealRequest.person.id, type: revealRequest.type })
      setRevealedContact({ personId: revealRequest.person.id, type: revealRequest.type, value: result.contact })
      setRevealRequest(null)
    } catch (caught) {
      setError(productErrorMessage(caught, "Não foi possível consultar o contato agora. Nenhum crédito foi consumido."))
    } finally {
      setRevealing(false)
    }
  }

  if (loading) return <main className="intent-v1-loading"><LoaderCircle className="intent-spin" size={22} />Preparando sua operação…</main>

  const projectName = workspace?.project.name ?? "Intent"
  const creditLimit = workspace?.project.monthlyCredits ?? 0
  const pageTitle = view === "inicio" ? "Início" : view === "pessoas" ? "Pessoas" : view === "contas" ? "Contas" : view === "watchlist" ? "Watchlist" : "ICP"

  return <div className="intent-v1-shell">
    <aside className="intent-v1-sidebar">
      <button className="intent-v1-brand" onClick={() => setView("inicio")} type="button"><span>In</span>Intent</button>
      <div className="intent-v1-company"><span>{initials(projectName)}</span><div><strong>{projectName}</strong><small>{workspace?.project.domain ?? "Sua operação"}</small></div></div>
      <p>Sua operação</p>
      <nav aria-label="Navegação principal">{items.map(({ id, label, icon: Icon }) => <button className={view === id ? "is-active" : ""} key={id} onClick={() => setView(id)} type="button"><Icon size={16} /><span>{label}</span>{id === "pessoas" && visiblePeople.length > 0 ? <small>{visiblePeople.length}</small> : id === "watchlist" && candidates.length > 0 ? <small>{candidates.length}</small> : id === "icp" ? <small>v{workspace?.latestIcp?.version ?? 1}</small> : null}</button>)}</nav>
      <footer><div className="intent-v1-credit"><span>Uso do plano</span><strong>{summary?.monthlyCostUsd.toLocaleString("pt-BR", { style: "currency", currency: "USD" }) ?? "US$ 0,00"}</strong><small>{creditLimit > 0 ? `${creditLimit.toLocaleString("pt-BR")} créditos disponíveis no ciclo` : "Plano em configuração"}</small></div><IcpStatus icp={activeIcp ?? workspace?.latestIcp} /></footer>
    </aside>

    <main className="intent-v1-main">
      <header className="intent-v1-header"><div><p>Intent <ChevronRight size={13} /> {pageTitle}</p><h1>{pageTitle}</h1></div><div><span className="intent-v1-email">{session.email}</span><Button onClick={() => void authService.signOut()} size="sm" variant="outline"><LogOut size={15} />Sair</Button></div></header>
      {error && <div className="intent-v1-error" role="alert"><CircleAlert size={16} />{error}</div>}

      {view === "inicio" && <section className="intent-v1-content">
        <div className="intent-v1-intro"><div><h2>Onde sua próxima oportunidade está aparecendo</h2><p>O Intent acompanha sinais públicos de pessoas que combinam com o seu perfil ideal. Só entram aqui dados reais já processados.</p></div><IcpStatus icp={activeIcp} /></div>
        {!activeIcp ? <div className="intent-v1-callout"><div><strong>Seu perfil ideal ainda precisa de revisão</strong><span>Ative o ICP para iniciar o radar de pessoas e acompanhar sinais de compra.</span></div><Button onClick={() => { window.history.pushState({}, "", "/icp"); window.dispatchEvent(new PopStateEvent("popstate")) }}>Revisar ICP</Button></div> : <>
          <div className="intent-v1-kpis">
            <article><span>Intenção com evidência</span><strong>{visiblePeople.filter((person) => person.comments > 0).length}</strong><small>Pessoas com sinal público registrado</small></article>
            <article><span>Pessoas no radar</span><strong>{visiblePeople.length}</strong><small>Perfis aderentes ao ICP</small></article>
            <article><span>Contas identificadas</span><strong>{companies.length}</strong><small>Empresas relacionadas aos sinais</small></article>
            <article><span>Watchlist ativa</span><strong>{monitoredSources.length}</strong><small>Perfis e páginas acompanhados</small></article>
          </div>
          <div className="intent-v1-grid">
            <section className="intent-v1-panel"><header><div><h3>Prioridade agora</h3><p>Pessoas que já apresentaram sinal público.</p></div><Button onClick={() => setView("pessoas")} size="sm" variant="outline">Ver pessoas</Button></header>{visiblePeople.filter((person) => person.comments > 0).slice(0, 5).map((person) => <PersonRow key={person.id} person={person} />)}{visiblePeople.filter((person) => person.comments > 0).length === 0 && <Empty text="Os primeiros sinais aparecerão aqui quando pessoas aderentes ao ICP interagirem publicamente." />}</section>
            <section className="intent-v1-panel"><header><div><h3>Contas em movimento</h3><p>Consolidação das empresas identificadas.</p></div><Button onClick={() => setView("contas")} size="sm" variant="outline">Ver contas</Button></header>{companies.slice(0, 5).map((company) => <CompanyRow company={company} key={company.id} />)}{companies.length === 0 && <Empty text="As contas aparecem conforme o Intent valida os sinais das pessoas." />}</section>
          </div>
        </>}
      </section>}

      {view === "pessoas" && <section className="intent-v1-content"><SectionHeading title="Pessoas" subtitle="Só aparecem perfis que passaram pelo filtro do perfil ideal e têm dados públicos organizados." />{revealRequest && <section className="intent-v1-contact-confirm" aria-live="polite"><div><strong>Consultar {revealRequest.type === "email" ? "e-mail" : "telefone"} de {revealRequest.person.name}?</strong><p>Esta consulta usa 1 crédito somente se um contato for disponibilizado. O dado é protegido e fica visível apenas para você.</p></div><div><Button disabled={revealing} onClick={() => setRevealRequest(null)} size="sm" variant="outline">Cancelar</Button><Button disabled={revealing} onClick={() => void confirmContactReveal()} size="sm">{revealing ? <><LoaderCircle className="intent-spin" size={14} />Consultando…</> : "Confirmar consulta"}</Button></div></section>}<div className="intent-v1-panel intent-v1-list">{visiblePeople.map((person) => <PersonRow detailed key={person.id} onReveal={(type) => setRevealRequest({ person, type })} revealedContact={revealedContact?.personId === person.id ? revealedContact : null} person={person} />)}{visiblePeople.length === 0 && <Empty text="Nenhuma pessoa qualificada foi encontrada ainda. O radar começa a aparecer após a ativação do ICP." />}</div></section>}

      {view === "contas" && <section className="intent-v1-content"><SectionHeading title="Contas" subtitle="Empresas associadas às pessoas e sinais reais já identificados." /><div className="intent-v1-panel intent-v1-list">{companies.map((company) => <CompanyRow company={company} detailed key={company.id} />)}{companies.length === 0 && <Empty text="Nenhuma conta foi identificada ainda." />}</div></section>}

      {view === "watchlist" && <section className="intent-v1-content"><SectionHeading title="Watchlist" subtitle="Perfis e páginas aprovados para acompanhamento recorrente. Sugestões aguardam sua decisão." /><div className="intent-v1-watch-columns"><section className="intent-v1-panel"><header><div><h3>Acompanhando</h3><p>Fontes com monitoramento ativo.</p></div><span className="intent-v1-count">{monitoredSources.length}</span></header>{monitoredSources.map((source) => <SourceRow key={source.id} source={source} />)}{monitoredSources.length === 0 && <Empty text="Nenhuma fonte aprovada está sendo acompanhada ainda." />}</section><section className="intent-v1-panel"><header><div><h3>Aguardando aprovação</h3><p>Sugestões criadas a partir de evidência real.</p></div><span className="intent-v1-count">{candidates.length}</span></header>{candidates.map((source) => <SourceRow key={source.id} source={source} />)}{candidates.length === 0 && <Empty text="Não há sugestões pendentes no momento." />}</section></div></section>}

      {view === "icp" && <section className="intent-v1-content"><SectionHeading title="Perfil ideal" subtitle="A régua que define quem entra no radar e quais sinais devem ser priorizados." /><section className="intent-v1-panel intent-v1-icp"><div><IcpStatus icp={workspace?.latestIcp} /><h3>{workspace?.latestIcp?.companySummary ?? "Seu ICP será criado a partir do site da sua empresa."}</h3><p>{workspace?.latestIcp?.status === "ativo" ? "Este perfil está ativo e orienta toda a operação." : "Revise os critérios antes de iniciar o radar."}</p></div><Button onClick={() => { window.history.pushState({}, "", "/icp"); window.dispatchEvent(new PopStateEvent("popstate")) }}>{workspace?.latestIcp ? "Editar ICP" : "Criar ICP"}</Button></section></section>}
    </main>
  </div>
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) { return <div className="intent-v1-section-heading"><h2>{title}</h2><p>{subtitle}</p></div> }
function Empty({ text }: { text: string }) { return <div className="intent-v1-empty"><LayoutList size={20} /><p>{text}</p></div> }
function PersonRow({ person, detailed = false, onReveal, revealedContact }: { person: SignalPerson; detailed?: boolean; onReveal?: (type: RevealContactType) => void; revealedContact?: { type: RevealContactType; value: string } | null }) { return <article className="intent-v1-row"><span className="intent-v1-avatar">{initials(person.name)}</span><div><strong>{person.name}</strong><p>{personSubline(person)}</p>{detailed && <a href={person.linkedinUrl} rel="noreferrer" target="_blank">Ver perfil público</a>}{detailed && onReveal && <div className="intent-v1-contact-actions">{revealedContact ? <span>{revealedContact.value}</span> : <><button onClick={() => onReveal("email")} type="button"><Mail size={13} />Consultar e-mail</button><button onClick={() => onReveal("telefone")} type="button"><Phone size={13} />Consultar telefone</button></>}</div>}</div><aside><b>{person.comments}</b><small>{person.comments === 1 ? "sinal" : "sinais"}</small></aside></article> }
function CompanyRow({ company, detailed = false }: { company: SignalCompany; detailed?: boolean }) { return <article className="intent-v1-row"><span className="intent-v1-avatar is-company"><Building2 size={17} /></span><div><strong>{company.name}</strong><p>{[company.sector, company.size].filter(Boolean).join(" · ") || "Conta identificada"}</p>{detailed && company.linkedinUrl && <a href={company.linkedinUrl} rel="noreferrer" target="_blank">Ver página pública</a>}</div><aside><b>{company.people}</b><small>{company.people === 1 ? "pessoa" : "pessoas"}</small></aside></article> }
function SourceRow({ source }: { source: SignalSource }) { return <article className="intent-v1-source"><div><strong>{source.name ?? "Fonte pública"}</strong><p>{source.posts} posts · {source.comments} interações públicas</p></div><span className={source.status === "monitorada" ? "is-active" : ""}>{source.status === "monitorada" ? "Acompanhando" : "Pendente"}</span></article> }
