import { useEffect, useMemo, useState } from "react"
import { Building2, ChevronRight, CircleAlert, Eye, Home, LayoutList, LoaderCircle, LogOut, Mail, Phone, Target, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { authService } from "@/features/auth/services/auth-service"
import { loadSignalComments, loadSignalCompanies, loadSignalPeople, loadSignalSources, loadSignalSummary, type SignalComment, type SignalCompany, type SignalPerson, type SignalSource, type SignalSummary } from "@/features/analytics/services/load-signals"
import { loadOnboardingWorkspace } from "@/features/onboarding/services/onboarding-service"
import type { IcpRecord, OnboardingWorkspace } from "@/features/onboarding/domain/onboarding"
import { productErrorMessage } from "@/lib/product-messages"
import { revealContact, type RevealContactType } from "@/features/intent/services/reveal-contact"
import "./intent-v1-workspace.css"
import "./intent-v1-contact.css"

type WorkspaceView = "inicio" | "pessoas" | "contas" | "watchlist" | "icp"
type Session = { email: string; userId: string }
const primaryItems: Array<{ id: Exclude<WorkspaceView, "icp">; label: string; icon: typeof Home }> = [{ id: "inicio", label: "Início", icon: Home }, { id: "pessoas", label: "Pessoas", icon: Users }, { id: "contas", label: "Contas", icon: Building2 }, { id: "watchlist", label: "Watchlist", icon: Eye }]

function initials(value: string) { return value.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "IN" }
function personSubline(person: SignalPerson) { return [person.role ?? person.headline, person.companyName].filter(Boolean).join(" · ") || "Perfil público identificado" }
function dateLabel(value: string | null) { if (!value) return "Sem data disponível"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Sem data disponível" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date) }
function IcpStatus({ icp }: { icp: IcpRecord | null | undefined }) { return <span className={`intent-v1-status ${icp?.status === "ativo" ? "is-active" : ""}`}>{icp?.status === "ativo" ? `ICP v${icp.version} ativo` : "ICP em revisão"}</span> }

export function IntentV1Workspace({ session }: { session: Session }) {
  const [view, setView] = useState<WorkspaceView>("inicio")
  const [workspace, setWorkspace] = useState<OnboardingWorkspace | null>(null)
  const [summary, setSummary] = useState<SignalSummary | null>(null)
  const [people, setPeople] = useState<SignalPerson[]>([])
  const [companies, setCompanies] = useState<SignalCompany[]>([])
  const [sources, setSources] = useState<SignalSource[]>([])
  const [comments, setComments] = useState<SignalComment[]>([])
  const [bucket, setBucket] = useState<"todos" | "forte" | "fraco">("todos")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [revealRequest, setRevealRequest] = useState<{ person: SignalPerson; type: RevealContactType } | null>(null)
  const [revealing, setRevealing] = useState(false)
  const [revealedContacts, setRevealedContacts] = useState<Record<string, Partial<Record<RevealContactType, string>>>>({})

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const nextWorkspace = await loadOnboardingWorkspace(session.userId)
        const nextSummary = await loadSignalSummary(session.userId)
        const projectId = nextSummary.projectId ?? nextWorkspace.project.id
        const [nextPeople, nextCompanies, nextSources, nextComments] = await Promise.all([loadSignalPeople(projectId), loadSignalCompanies(projectId), loadSignalSources(projectId), loadSignalComments(projectId)])
        if (!active) return
        setWorkspace(nextWorkspace); setSummary(nextSummary); setPeople(nextPeople); setCompanies(nextCompanies); setSources(nextSources); setComments(nextComments)
      } catch (caught) { if (active) setError(productErrorMessage(caught, "Não conseguimos carregar sua operação agora. Seus dados continuam protegidos; tente atualizar em alguns instantes.")) }
      finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [session.userId])

  const activeIcp = workspace?.activeIcp
  const visiblePeople = useMemo(() => people.filter((person) => person.icp !== false), [people])
  const peopleWithSignals = useMemo(() => visiblePeople.filter((person) => (person.signalCount ?? person.comments) > 0), [visiblePeople])
  const strongPeople = useMemo(() => peopleWithSignals.filter((person) => person.priorityBucket === "alta" || (person.intentScore ?? 0) >= 80 || person.intentStatus === "lead"), [peopleWithSignals])
  const weakPeople = useMemo(() => peopleWithSignals.filter((person) => !strongPeople.some((strong) => strong.id === person.id)), [peopleWithSignals, strongPeople])
  const peopleByPriority = useMemo(() => [...peopleWithSignals].sort((a, b) => (b.priorityScore ?? b.intentScore ?? 0) - (a.priorityScore ?? a.intentScore ?? 0) || (b.signalCount ?? b.comments) - (a.signalCount ?? a.comments)), [peopleWithSignals])
  const candidates = useMemo(() => sources.filter((source) => source.status === "candidata"), [sources])
  const watchPages = useMemo(() => sources.filter((source) => source.kind === "pagina"), [sources])
  const watchPeople = useMemo(() => sources.filter((source) => source.kind === "pessoa"), [sources])
  const commentsByPerson = useMemo(() => {
    const latest = new Map<string, SignalComment>()
    for (const comment of comments) {
      const current = latest.get(comment.personId)
      if (!current || new Date(comment.publishedAt ?? 0).getTime() > new Date(current.publishedAt ?? 0).getTime()) latest.set(comment.personId, comment)
    }
    return latest
  }, [comments])
  const newThisWeek = useMemo(() => { const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; return visiblePeople.filter((person) => person.createdAt && new Date(person.createdAt).getTime() >= cutoff).length }, [visiblePeople])
  const selectedPeople = bucket === "forte" ? strongPeople : bucket === "fraco" ? weakPeople : peopleWithSignals

  async function confirmContactReveal() {
    if (!revealRequest || !workspace) return
    setRevealing(true); setError("")
    try { const result = await revealContact({ projectId: workspace.project.id, personId: revealRequest.person.id, type: revealRequest.type }); setRevealedContacts((current) => ({ ...current, [revealRequest.person.id]: { ...current[revealRequest.person.id], [revealRequest.type]: result.contact } })); setRevealRequest(null) }
    catch (caught) { setError(productErrorMessage(caught, "Não foi possível consultar o contato agora. Nenhum crédito foi consumido.")) }
    finally { setRevealing(false) }
  }

  if (loading) return <main className="intent-v1-loading"><LoaderCircle className="intent-spin" size={22} />Preparando sua operação…</main>
  const projectName = workspace?.project.name ?? "Intent"
  const pageTitle = view === "inicio" ? "Início" : view === "pessoas" ? "Pessoas" : view === "contas" ? "Contas" : view === "watchlist" ? "Watchlist" : "ICP"
  const usage = summary?.monthlyCostUsd ?? 0
  const creditLimit = workspace?.project.monthlyCredits ?? 0

  return <div className="intent-v1-shell">
    <aside className="intent-v1-sidebar">
      <button className="intent-v1-brand" onClick={() => setView("inicio")} type="button"><span>In</span>Intent</button>
      <div className="intent-v1-company"><span>{initials(projectName)}</span><div><strong>{projectName}</strong><small>{workspace?.project.domain ?? "Seu workspace"}</small></div></div>
      <p>Workspace</p>
      <nav aria-label="Navegação principal">{primaryItems.map(({ id, label, icon: Icon }) => <button className={view === id ? "is-active" : ""} key={id} onClick={() => setView(id)} type="button"><Icon size={16} /><span>{label}</span>{id === "pessoas" && peopleWithSignals.length > 0 ? <small>{peopleWithSignals.length}</small> : id === "watchlist" && candidates.length > 0 ? <small>{candidates.length}</small> : null}</button>)}</nav>
      <p>Configuração</p>
      <nav aria-label="Configuração"><button className={view === "icp" ? "is-active" : ""} onClick={() => setView("icp")} type="button"><Target size={16} /><span>ICP</span><small>v{workspace?.latestIcp?.version ?? 1}</small></button></nav>
      <footer><div className="intent-v1-credit"><span>Uso deste mês</span><strong>{usage.toLocaleString("pt-BR", { style: "currency", currency: "USD" })}</strong><i><b style={{ width: `${creditLimit > 0 ? Math.min(100, Math.round((usage / creditLimit) * 100)) : 0}%` }} /></i><small>{creditLimit > 0 ? `Limite mensal de ${creditLimit.toLocaleString("pt-BR")} créditos` : "Plano em configuração"}</small></div><div className="intent-v1-ready"><b />Dados protegidos</div><IcpStatus icp={activeIcp ?? workspace?.latestIcp} /></footer>
    </aside>
    <main className="intent-v1-main">
      <header className="intent-v1-header"><div><p>Intent <ChevronRight size={13} /> {pageTitle}</p><h1>{pageTitle}</h1></div><div><span className="intent-v1-email">{session.email}</span><Button onClick={() => void authService.signOut()} size="sm" variant="outline"><LogOut size={15} />Sair</Button></div></header>
      {error && <div className="intent-v1-error" role="alert"><CircleAlert size={16} />{error}</div>}
      {view === "inicio" && <section className="intent-v1-content"><div className="intent-v1-intro"><div><h2>Quem merece sua atenção hoje</h2><p>Pessoas e empresas ordenadas por evidências públicas, sem inventar dados.</p></div><IcpStatus icp={activeIcp} /></div>{!activeIcp ? <div className="intent-v1-callout"><div><strong>Seu perfil ideal ainda precisa de revisão</strong><span>Ative o ICP para o Intent priorizar as conversas certas.</span></div><Button onClick={() => { window.history.pushState({}, "", "/icp"); window.dispatchEvent(new PopStateEvent("popstate")) }}>Revisar ICP</Button></div> : <><div className="intent-v1-kpis"><Kpi label="Intenção forte" value={strongPeople.length} detail="Pessoas com sinais priorizados" /><Kpi label="Sinal fraco" value={weakPeople.length} detail="Pessoas para acompanhar" /><Kpi label="Contas em movimento" value={companies.filter((company) => company.people > 0).length} detail="Empresas com pessoas observadas" /><Kpi label="Novas esta semana" value={newThisWeek} detail="Perfis recém-identificados" /></div><div className="intent-v1-grid"><section className="intent-v1-panel"><header><div><h3>Fila de hoje</h3><p>Prioridade baseada nos sinais já registrados.</p></div><Button onClick={() => setView("pessoas")} size="sm" variant="outline">Ver pessoas</Button></header><div className="intent-v1-list">{peopleByPriority.slice(0, 5).map((person) => <PersonRow evidence={commentsByPerson.get(person.id)} key={person.id} person={person} />)}{peopleByPriority.length === 0 && <Empty text="Os primeiros sinais aparecerão aqui quando pessoas aderentes ao ICP interagirem publicamente." />}</div></section><div className="intent-v1-home-side"><section className="intent-v1-panel"><header><div><h3>Contas em movimento</h3><p>Empresas consolidadas a partir das pessoas observadas.</p></div><Button onClick={() => setView("contas")} size="sm" variant="outline">Ver contas</Button></header>{companies.slice(0, 4).map((company) => <CompanyRow company={company} key={company.id} />)}{companies.length === 0 && <Empty text="As contas aparecem depois da primeira coleta validada." />}</section><section className="intent-v1-panel"><header><div><h3>Sugestões da Watchlist</h3><p>Fontes públicas esperando uma decisão.</p></div><Button onClick={() => setView("watchlist")} size="sm" variant="outline">Abrir</Button></header>{candidates.slice(0, 3).map((source) => <SourceRow key={source.id} source={source} />)}{candidates.length === 0 && <Empty text="Não há sugestões pendentes no momento." />}</section></div></div></>}</section>}
      {view === "pessoas" && <section className="intent-v1-content"><SectionHeading title="Pessoas" subtitle="Perfis reais ordenados pela força do sinal público e pela aderência ao ICP." />{revealRequest && <section className="intent-v1-contact-confirm" aria-live="polite"><div><strong>Consultar {revealRequest.type === "email" ? "e-mail" : "telefone"} de {revealRequest.person.name}?</strong><p>Esta consulta usa 1 crédito somente se um contato for disponibilizado. O dado é protegido e fica visível apenas para você.</p></div><div><Button disabled={revealing} onClick={() => setRevealRequest(null)} size="sm" variant="outline">Cancelar</Button><Button disabled={revealing} onClick={() => void confirmContactReveal()} size="sm">{revealing ? <><LoaderCircle className="intent-spin" size={14} />Consultando…</> : "Confirmar consulta"}</Button></div></section>}<div className="intent-v1-buckets"><Bucket active={bucket === "todos"} label="Todos" onClick={() => setBucket("todos")} count={peopleWithSignals.length} /><Bucket active={bucket === "forte"} label="Intenção forte" onClick={() => setBucket("forte")} count={strongPeople.length} /><Bucket active={bucket === "fraco"} label="Sinal fraco" onClick={() => setBucket("fraco")} count={weakPeople.length} /></div><section className="intent-v1-panel intent-v1-table-wrap"><PeopleTable commentsByPerson={commentsByPerson} onReveal={(person, type) => setRevealRequest({ person, type })} people={selectedPeople} revealedContacts={revealedContacts} />{selectedPeople.length === 0 && <Empty text="Nenhuma pessoa com sinal público foi encontrada neste filtro." />}</section></section>}
      {view === "contas" && <section className="intent-v1-content"><SectionHeading title="Contas" subtitle="Empresas associadas a pessoas e interações públicas já observadas." /><section className="intent-v1-panel intent-v1-table-wrap"><CompaniesTable companies={companies} />{companies.length === 0 && <Empty text="Nenhuma conta foi identificada ainda." />}</section></section>}
      {view === "watchlist" && <section className="intent-v1-content"><SectionHeading title="Watchlist" subtitle="Fontes públicas separadas por tipo, com origem e status de acompanhamento preservados." /><div className="intent-v1-watch-columns"><SourcePanel title="Páginas" subtitle="Empresas e páginas públicas acompanhadas." sources={watchPages} /><SourcePanel title="Pessoas" subtitle="Perfis públicos aprovados para acompanhar." sources={watchPeople} /></div>{watchPages.length + watchPeople.length === 0 && <section className="intent-v1-panel"><Empty text="A Watchlist será preenchida conforme fontes públicas forem aprovadas." /></section>}</section>}
      {view === "icp" && <section className="intent-v1-content"><SectionHeading title="Perfil ideal" subtitle="A régua que define quem entra no radar e quais sinais merecem prioridade." /><section className="intent-v1-panel intent-v1-icp"><div><IcpStatus icp={workspace?.latestIcp} /><h3>{workspace?.latestIcp?.companySummary ?? "Seu ICP será criado a partir do site da sua empresa."}</h3><p>{workspace?.latestIcp?.status === "ativo" ? "Este perfil está ativo e orienta toda a operação." : "Revise os critérios antes de iniciar o radar."}</p></div><Button onClick={() => { window.history.pushState({}, "", "/icp"); window.dispatchEvent(new PopStateEvent("popstate")) }}>{workspace?.latestIcp ? "Editar ICP" : "Criar ICP"}</Button></section></section>}
    </main>
  </div>
}

function Kpi({ label, value, detail }: { label: string; value: number; detail: string }) { return <article><span>{label}</span><strong>{value}</strong><small>{detail}</small></article> }
function Bucket({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) { return <button className={active ? "is-active" : ""} onClick={onClick} type="button">{label}<small>{count}</small></button> }
function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) { return <div className="intent-v1-section-heading"><h2>{title}</h2><p>{subtitle}</p></div> }
function Empty({ text }: { text: string }) { return <div className="intent-v1-empty"><LayoutList size={20} /><p>{text}</p></div> }
function PersonRow({ person, evidence }: { person: SignalPerson; evidence?: SignalComment }) { return <article className="intent-v1-row"><span className="intent-v1-avatar">{initials(person.name)}</span><div><strong>{person.name}</strong><p>{personSubline(person)}</p>{evidence && <q>{evidence.text}</q>}</div><aside><b>{person.priorityScore ?? person.intentScore ?? person.comments}</b><small>{person.priorityLabel ?? (person.intentScore === null ? "sinais" : "prioridade")}</small></aside></article> }
function CompanyRow({ company }: { company: SignalCompany }) { return <article className="intent-v1-row"><span className="intent-v1-avatar is-company"><Building2 size={17} /></span><div><strong>{company.name}</strong><p>{[company.sector, company.size].filter(Boolean).join(" · ") || "Conta identificada"}</p></div><aside><b>{company.people}</b><small>{company.people === 1 ? "pessoa" : "pessoas"}</small></aside></article> }
function SourceRow({ source }: { source: SignalSource }) { return <article className="intent-v1-source"><div><strong>{source.name ?? "Fonte pública"}</strong><p>{source.posts} posts · {source.comments} interações públicas</p></div><span className={source.status === "monitorada" ? "is-active" : ""}>{source.status === "monitorada" ? "Acompanhando" : "Pendente"}</span></article> }
function SourcePanel({ title, subtitle, sources }: { title: string; subtitle: string; sources: SignalSource[] }) { return <section className="intent-v1-panel"><header><div><h3>{title}</h3><p>{subtitle}</p></div><span className="intent-v1-count">{sources.length}</span></header>{sources.map((source) => <SourceRow key={source.id} source={source} />)}{sources.length === 0 && <Empty text="Nenhuma fonte deste tipo foi aprovada ainda." />}</section> }
function PeopleTable({ people, commentsByPerson, onReveal, revealedContacts }: { people: SignalPerson[]; commentsByPerson: Map<string, SignalComment>; onReveal: (person: SignalPerson, type: RevealContactType) => void; revealedContacts: Record<string, Partial<Record<RevealContactType, string>>> }) { return <table className="intent-v1-table"><thead><tr><th>Pessoa</th><th>Intenção</th><th>Evidência pública</th><th>Contato</th></tr></thead><tbody>{people.map((person) => { const evidence = commentsByPerson.get(person.id); const contacts = revealedContacts[person.id]; const signalCount = person.signalCount ?? person.comments; const displayScore = person.intentScore ?? person.priorityScore; return <tr key={person.id}><td><div className="intent-v1-person-cell"><span className="intent-v1-avatar">{initials(person.name)}</span><div><strong>{person.name}</strong><small>{personSubline(person)}</small></div></div></td><td><span className={`intent-v1-intent ${person.priorityBucket === "alta" || person.intentStatus === "lead" || (person.intentScore ?? 0) >= 80 ? "is-strong" : ""}`}>{displayScore ?? "—"}{displayScore !== null && displayScore !== undefined && "%"}</span><small>{signalCount} {signalCount === 1 ? "sinal" : "sinais"}</small></td><td>{evidence ? <><q>{evidence.text}</q><small>{dateLabel(evidence.publishedAt)}</small></> : <small>Sem evidência textual disponível</small>}</td><td><div className="intent-v1-contact-actions">{contacts?.email ? <span>{contacts.email}</span> : <button aria-label="Consultar e-mail" onClick={() => onReveal(person, "email")} type="button"><Mail size={13} />E-mail</button>}{contacts?.telefone ? <span>{contacts.telefone}</span> : <button aria-label="Consultar telefone" onClick={() => onReveal(person, "telefone")} type="button"><Phone size={13} />Telefone</button>}</div></td></tr> })}</tbody></table> }
function CompaniesTable({ companies }: { companies: SignalCompany[] }) { return <table className="intent-v1-table"><thead><tr><th>Empresa</th><th>Pessoas</th><th>Sinais</th><th>Nível</th></tr></thead><tbody>{companies.map((company) => <tr key={company.id}><td><div className="intent-v1-person-cell"><span className="intent-v1-avatar is-company"><Building2 size={16} /></span><div><strong>{company.name}</strong><small>{[company.sector, company.size].filter(Boolean).join(" · ") || "Conta identificada"}</small></div></div></td><td>{company.people}</td><td>{company.comments}</td><td><span className={`intent-v1-level ${company.people > 1 ? "is-moving" : ""}`}>{company.people > 1 ? "Em movimento" : "Observando"}</span></td></tr>)}</tbody></table> }
