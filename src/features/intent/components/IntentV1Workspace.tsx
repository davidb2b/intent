import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react"
import { Building2, CheckCircle2, ChevronRight, CircleAlert, Eye, FlaskConical, Home, LayoutList, LogOut, Mail, Phone, Target, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { authService } from "@/features/auth/services/auth-service"
import { loadIntentSignalEvidence, loadSignalCompanies, loadSignalPeople, loadSignalSources, loadSignalSummary, type SignalComment, type SignalCompany, type SignalPerson, type SignalSource, type SignalSummary } from "@/features/analytics/services/load-signals"
import { loadOnboardingWorkspace } from "@/features/onboarding/services/onboarding-service"
import type { IcpRecord, OnboardingWorkspace } from "@/features/onboarding/domain/onboarding"
import { productErrorMessage } from "@/lib/product-messages"
import { revealContact, type RevealContactType } from "@/features/intent/services/reveal-contact"
import { updateSourceStatus } from "@/features/collection/services/update-source-status"
import { markPersonAsClient } from "@/features/people/services/mark-person-client"
import { previewSignal, type PreviewSignalResult } from "@/features/classification/services/preview-signal"
import { sendPersonToCrm } from "@/features/intent/services/send-person-to-crm"
import "./intent-v1-workspace.css"
import "./intent-v1-contact.css"

type WorkspaceView = "inicio" | "pessoas" | "contas" | "watchlist" | "icp" | "sim"
type Session = { email: string; userId: string }
const primaryItems: Array<{ id: Exclude<WorkspaceView, "icp">; label: string; icon: typeof Home }> = [{ id: "inicio", label: "Início", icon: Home }, { id: "pessoas", label: "Pessoas", icon: Users }, { id: "contas", label: "Contas", icon: Building2 }, { id: "watchlist", label: "Watchlist", icon: Eye }]

function initials(value: string) { return value.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "IN" }
function personSubline(person: SignalPerson) { return [person.role ?? person.headline, person.companyName].filter(Boolean).join(" · ") || "Perfil público identificado" }
function personDrawerSubline(person: SignalPerson) { return [person.role ?? person.headline, person.companyName, person.companySize, person.companySector].filter(Boolean).join(" · ") || "Perfil público identificado" }
function personStatusRank(status: string | null) { return status === "lead" ? 0 : status === "sinal_fraco" ? 1 : status === "cliente" ? 2 : status === "fora_icp" ? 3 : 4 }
function IcpStatus({ icp }: { icp: IcpRecord | null | undefined }) { return <span className={`intent-v1-status ${icp?.status === "ativo" ? "is-active" : ""}`}>{icp?.status === "ativo" ? `ICP v${icp.version} ativo` : "ICP em revisão"}</span> }

export function IntentV1Workspace({ session }: { session: Session }) {
  const [view, setView] = useState<WorkspaceView>("inicio")
  const [workspace, setWorkspace] = useState<OnboardingWorkspace | null>(null)
  const [summary, setSummary] = useState<SignalSummary | null>(null)
  const [people, setPeople] = useState<SignalPerson[]>([])
  const [companies, setCompanies] = useState<SignalCompany[]>([])
  const [sources, setSources] = useState<SignalSource[]>([])
  const [comments, setComments] = useState<SignalComment[]>([])
  const [bucket, setBucket] = useState<"todos" | "forte" | "fraco" | "clientes">("todos")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [revealRequest, setRevealRequest] = useState<{ person: SignalPerson; type: RevealContactType } | null>(null)
  const [revealing, setRevealing] = useState(false)
  const [revealedContacts, setRevealedContacts] = useState<Record<string, Partial<Record<RevealContactType, string>>>>({})
  const [previewInput, setPreviewInput] = useState({ evidence: "", personName: "", role: "", company: "" })
  const [previewResult, setPreviewResult] = useState<PreviewSignalResult | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<SignalPerson | null>(null)
  const [sourceBusy, setSourceBusy] = useState<string | null>(null)
  const [markingClient, setMarkingClient] = useState(false)
  const [sendingToCrm, setSendingToCrm] = useState(false)
  const [notice, setNotice] = useState("")

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const nextWorkspace = await loadOnboardingWorkspace(session.userId)
        const nextSummary = await loadSignalSummary(session.userId)
        const projectId = nextSummary.projectId ?? nextWorkspace.project.id
        const [nextPeople, nextCompanies, nextSources, nextComments] = await Promise.all([loadSignalPeople(projectId), loadSignalCompanies(projectId), loadSignalSources(projectId), loadIntentSignalEvidence(projectId)])
        if (!active) return
        setWorkspace(nextWorkspace); setSummary(nextSummary); setPeople(nextPeople); setCompanies(nextCompanies); setSources(nextSources); setComments(nextComments)
      } catch (caught) { if (active) setError(productErrorMessage(caught, "Não conseguimos carregar sua operação agora. Seus dados continuam protegidos; tente atualizar em alguns instantes.")) }
      finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [session.userId])

  useEffect(() => {
    if (!selectedPerson) return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setSelectedPerson(null)
    }
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [selectedPerson])

  const activeIcp = workspace?.activeIcp
  const visiblePeople = useMemo(() => people.filter((person) => ["lead", "sinal_fraco", "cliente", "fora_icp"].includes(person.intentStatus ?? "")), [people])
  const peopleWithSignals = useMemo(() => visiblePeople.filter((person) => (person.signalCount ?? person.comments) > 0), [visiblePeople])
  const strongPeople = useMemo(() => peopleWithSignals.filter((person) => person.intentStatus === "lead"), [peopleWithSignals])
  const weakPeople = useMemo(() => peopleWithSignals.filter((person) => person.intentStatus === "sinal_fraco"), [peopleWithSignals])
  const clientPeople = useMemo(() => peopleWithSignals.filter((person) => person.intentStatus === "cliente"), [peopleWithSignals])
  const peopleByPriority = useMemo(() => [...peopleWithSignals].filter((person) => person.intentStatus !== "fora_icp").sort((a, b) => (b.priorityScore ?? b.intentScore ?? 0) - (a.priorityScore ?? a.intentScore ?? 0) || (b.signalCount ?? b.comments) - (a.signalCount ?? a.comments)), [peopleWithSignals])
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
  const selectedPeople = useMemo(() => [...(bucket === "forte" ? strongPeople : bucket === "fraco" ? weakPeople : bucket === "clientes" ? clientPeople : peopleWithSignals)].sort((first, second) => personStatusRank(first.intentStatus) - personStatusRank(second.intentStatus) || (second.intentScore ?? second.priorityScore ?? 0) - (first.intentScore ?? first.priorityScore ?? 0) || first.name.localeCompare(second.name, "pt-BR")), [bucket, clientPeople, peopleWithSignals, strongPeople, weakPeople])

  async function confirmContactReveal() {
    if (!revealRequest || !workspace) return
    setRevealing(true); setError(""); setNotice("")
    try { const result = await revealContact({ projectId: workspace.project.id, personId: revealRequest.person.id, type: revealRequest.type }); setRevealedContacts((current) => ({ ...current, [revealRequest.person.id]: { ...current[revealRequest.person.id], [revealRequest.type]: result.contact } })); setNotice(`${revealRequest.type === "email" ? "E-mail" : "Telefone"} disponibilizado com segurança.`); setRevealRequest(null) }
    catch (caught) { setError(productErrorMessage(caught, "Não foi possível consultar o contato agora. Nenhum crédito foi consumido.")) }
    finally { setRevealing(false) }
  }

  async function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!summary?.projectId) return
    setPreviewBusy(true); setError(""); setPreviewResult(null)
    try { setPreviewResult(await previewSignal({ projectId: summary.projectId, ...previewInput })) }
    catch (caught) { setError(productErrorMessage(caught, "Não foi possível avaliar esta evidência agora.")) }
    finally { setPreviewBusy(false) }
  }

  async function changeSourceStatus(source: SignalSource, status: "monitorada" | "descartada") {
    setSourceBusy(source.id); setError("")
    try { await updateSourceStatus(source.id, status); setSources((current) => current.map((item) => item.id === source.id ? { ...item, status } : item)) }
    catch (caught) { setError(productErrorMessage(caught, "Não foi possível atualizar esta fonte agora.")) }
    finally { setSourceBusy(null) }
  }

  async function confirmClient(person: SignalPerson) {
    setMarkingClient(true); setError(""); setNotice("")
    try {
      await markPersonAsClient(person.id)
      const nextPerson: SignalPerson = { ...person, intentStatus: "cliente", priorityBucket: "alta", priorityLabel: "Cliente" }
      setPeople((current) => current.map((item) => item.id === person.id ? nextPerson : item))
      setSelectedPerson(null)
      setNotice(`${person.name} foi marcada como cliente e saiu da fila de abordagem.`)
    } catch (caught) { setError(productErrorMessage(caught, "Não foi possível salvar esta pessoa como cliente agora.")) }
    finally { setMarkingClient(false) }
  }

  async function sendSelectedPersonToCrm(person: SignalPerson) {
    if (!workspace) return
    setSendingToCrm(true); setError(""); setNotice("")
    try { await sendPersonToCrm({ projectId: workspace.project.id, personId: person.id }); setNotice(`${person.name} foi enviada ao CRM.`) }
    catch (caught) { setError(productErrorMessage(caught, "Não foi possível enviar esta pessoa ao CRM agora.")) }
    finally { setSendingToCrm(false) }
  }

  if (loading) return <main aria-live="polite" className="intent-v1-loading"><Spinner label="Preparando sua operação" />Preparando sua operação…</main>
  const projectName = workspace?.project.name ?? "Intent"
  const pageTitle = view === "inicio" ? "Início" : view === "pessoas" ? "Pessoas" : view === "contas" ? "Contas" : view === "watchlist" ? "Watchlist" : view === "icp" ? "ICP" : "Testar classificação"
  const creditLimit = summary?.creditsLimit ?? workspace?.project.monthlyCredits ?? 0
  const creditsUsed = (summary?.creditsUsed ?? 0) + (summary?.creditsReserved ?? 0)

  return <div className="intent-v1-shell">
    <aside className="intent-v1-sidebar">
      <button className="intent-v1-brand" onClick={() => setView("inicio")} type="button"><span>In</span>Intent</button>
      <div className="intent-v1-company"><span>{initials(projectName)}</span><div><strong>{projectName}</strong><small>{workspace?.project.domain ?? "Seu workspace"}</small></div></div>
      <p>Workspace</p>
      <nav aria-label="Navegação principal">{primaryItems.map(({ id, label, icon: Icon }) => <button className={view === id ? "is-active" : ""} key={id} onClick={() => setView(id)} type="button"><Icon size={16} /><span>{label}</span>{id === "pessoas" && peopleWithSignals.length > 0 ? <small>{peopleWithSignals.length}</small> : id === "contas" && companies.length > 0 ? <small>{companies.length}</small> : id === "watchlist" && watchPages.length + watchPeople.length > 0 ? <small>{watchPages.length + watchPeople.length}</small> : null}</button>)}</nav>
      <p>Configuração</p>
      <nav aria-label="Configuração"><button className={view === "icp" ? "is-active" : ""} onClick={() => setView("icp")} type="button"><Target size={16} /><span>ICP</span><small>v{activeIcp?.version ?? workspace?.latestIcp?.version ?? 1}</small></button><button className={view === "sim" ? "is-active" : ""} onClick={() => setView("sim")} type="button"><FlaskConical size={16} /><span>Testar classificação</span></button></nav>
      <footer><div className="intent-v1-credit"><span>Uso do plano</span><strong>{creditsUsed.toLocaleString("pt-BR")} / {creditLimit.toLocaleString("pt-BR")}</strong><i><b style={{ width: `${creditLimit > 0 ? Math.min(100, Math.round((creditsUsed / creditLimit) * 100)) : 0}%` }} /></i><small>{creditLimit > 0 ? "créditos usados neste ciclo" : "Plano em configuração"}</small></div><div className="intent-v1-ready"><b />Dados protegidos</div><IcpStatus icp={activeIcp ?? workspace?.latestIcp} /></footer>
    </aside>
    <main className="intent-v1-main">
      {view !== "pessoas" && view !== "contas" && view !== "watchlist" && view !== "sim" && <header className="intent-v1-header"><div><p>Intent <ChevronRight size={13} /> {pageTitle}</p><h1>{pageTitle}</h1></div><div><span className="intent-v1-email">{session.email}</span><Button onClick={() => void authService.signOut()} size="sm" variant="outline"><LogOut size={15} />Sair</Button></div></header>}
      {error && <div className="intent-v1-error" role="alert"><CircleAlert size={16} />{error}</div>}
      {notice && !selectedPerson && <div className="intent-v1-notice" role="status"><CheckCircle2 size={16} />{notice}</div>}
      {view === "inicio" && <section className="intent-v1-content"><div className="intent-v1-intro"><div><h2>Quem merece sua atenção hoje</h2><p>Pessoas e empresas priorizadas pelas evidências mais recentes.</p></div><IcpStatus icp={activeIcp} /></div>{!activeIcp ? <div className="intent-v1-callout"><div><strong>Seu perfil ideal ainda precisa de revisão</strong><span>Ative o ICP para o Intent priorizar as conversas certas.</span></div><Button onClick={() => setView("icp")}>Revisar ICP</Button></div> : <><div className="intent-v1-kpis"><Kpi label="Intenção forte" value={strongPeople.length} detail="Pessoas com sinais priorizados" /><Kpi label="Sinal fraco" value={weakPeople.length} detail="Pessoas para acompanhar" /><Kpi label="Contas em movimento" value={companies.filter((company) => company.level === "em_movimento").length} detail="Duas ou mais pessoas com sinal" /><Kpi label="Novas esta semana" value={newThisWeek} detail="Perfis recém-identificados" /></div><div className="intent-v1-grid"><section className="intent-v1-panel"><header><div><h3>Fila de hoje</h3><p>Prioridade baseada nos sinais mais relevantes.</p></div><Button onClick={() => setView("pessoas")} size="sm" variant="outline">Ver pessoas</Button></header><div className="intent-v1-list">{peopleByPriority.slice(0, 5).map((person) => <PersonRow evidence={commentsByPerson.get(person.id)} key={person.id} person={person} />)}{peopleByPriority.length === 0 && <Empty text="Os primeiros sinais aparecerão aqui quando pessoas aderentes ao ICP interagirem publicamente." />}</div></section><div className="intent-v1-home-side"><section className="intent-v1-panel"><header><div><h3>Contas em movimento</h3><p>Empresas com duas ou mais pessoas sinalizadas.</p></div><Button onClick={() => setView("contas")} size="sm" variant="outline">Ver contas</Button></header>{companies.filter((company) => company.level === "em_movimento").slice(0, 4).map((company) => <CompanyRow company={company} key={company.id} />)}{companies.every((company) => company.level !== "em_movimento") && <Empty text="As contas em movimento aparecem quando duas pessoas da mesma empresa têm sinais públicos." />}</section><section className="intent-v1-panel"><header><div><h3>Sugestões da Watchlist</h3><p>Perfis e páginas esperando sua decisão.</p></div><Button onClick={() => setView("watchlist")} size="sm" variant="outline">Abrir</Button></header>{candidates.slice(0, 3).map((source) => <SourceRow key={source.id} source={source} />)}{candidates.length === 0 && <Empty text="Não há sugestões pendentes no momento." />}</section></div></div></>}</section>}
      {view === "pessoas" && <section className="intent-v1-content"><SectionHeading action={<IcpStatus icp={activeIcp ?? workspace?.latestIcp} />} primary title="Pessoas" subtitle="Só aparece aqui quem passou pela régua do ICP e deu algum sinal público. Intenção forte é para abordar agora; sinal fraco é para acompanhar — é de lá que saem os próximos leads. Quem ainda não se movimentou segue sendo acompanhado até dar o primeiro sinal." /><div className="intent-v1-buckets"><Bucket active={bucket === "forte"} label="🔥 Intenção forte" onClick={() => setBucket("forte")} count={strongPeople.length} /><Bucket active={bucket === "fraco"} label="Sinal fraco" onClick={() => setBucket("fraco")} count={weakPeople.length} /><Bucket active={bucket === "clientes"} label="Clientes" onClick={() => setBucket("clientes")} count={clientPeople.length} /><Bucket active={bucket === "todos"} label="Todas" onClick={() => setBucket("todos")} count={peopleWithSignals.length} /></div><section className="intent-v1-panel intent-v1-table-wrap"><PeopleTable commentsByPerson={commentsByPerson} onSelect={(person) => { setError(""); setNotice(""); setRevealRequest(null); setSelectedPerson(person) }} people={selectedPeople} />{selectedPeople.length === 0 && <Empty text="Nenhuma pessoa com sinal público foi encontrada neste filtro." />}</section><p className="intent-v1-table-help">Ordenado por prioridade. Selecione uma pessoa para ver a evidência completa, consultar contato ou marcar como cliente.</p></section>}
      {view === "contas" && <section className="intent-v1-content"><SectionHeading primary title="Contas" subtitle="Visão por empresa. Quando mais de uma pessoa da mesma empresa aparece, a conta é marcada como em movimento." /><section className="intent-v1-panel intent-v1-table-wrap intent-v1-companies-panel"><CompaniesTable companies={companies} />{companies.length === 0 && <Empty text="Nenhuma conta detectada ainda." />}</section></section>}
      {view === "watchlist" && <section className="intent-v1-content"><SectionHeading primary title="Watchlist" subtitle="Páginas e pessoas que ajudam o Intent a acompanhar as conversas mais relevantes para o seu mercado." /><div className="intent-v1-watch-columns"><SourcePanel onStatusChange={changeSourceStatus} busyId={sourceBusy} title="Páginas" subtitle="Empresas e páginas acompanhadas ou sugeridas." sources={watchPages} /><SourcePanel onStatusChange={changeSourceStatus} busyId={sourceBusy} title="Pessoas" subtitle="Perfis acompanhados ou aguardando sua decisão." sources={watchPeople} /></div>{watchPages.length + watchPeople.length === 0 && <section className="intent-v1-panel"><Empty text="A Watchlist será preenchida quando novos perfis e páginas forem encontrados." /></section>}</section>}
      {view === "icp" && <section className="intent-v1-content"><SectionHeading title="Perfil ideal" subtitle="A régua que define quem entra no radar e quais sinais merecem prioridade." /><section className="intent-v1-panel intent-v1-icp"><div><IcpStatus icp={workspace?.latestIcp} /><h3>{workspace?.latestIcp?.companySummary ?? "Seu ICP será criado a partir do site da sua empresa."}</h3><p>{workspace?.latestIcp?.status === "ativo" ? "Este perfil está ativo e orienta toda a operação." : "Revise os critérios antes de iniciar o radar."}</p></div><Button onClick={() => { window.history.pushState({}, "", "/icp"); window.dispatchEvent(new PopStateEvent("popstate")) }}>{workspace?.latestIcp ? "Editar ICP" : "Criar ICP"}</Button></section></section>}
      {view === "sim" && <ClassificationTester input={previewInput} busy={previewBusy} result={previewResult} onChange={(field, value) => setPreviewInput((current) => ({ ...current, [field]: value }))} onSubmit={submitPreview} />}
      {selectedPerson && <PersonDrawer comments={comments} error={error} markingClient={markingClient} notice={notice} onCancelReveal={() => setRevealRequest(null)} onClose={() => { setRevealRequest(null); setSelectedPerson(null) }} onConfirmReveal={() => void confirmContactReveal()} onMarkClient={() => void confirmClient(selectedPerson)} onReveal={(type) => { setError(""); setNotice(""); setRevealRequest({ person: selectedPerson, type }) }} onSendToCrm={() => void sendSelectedPersonToCrm(selectedPerson)} person={selectedPerson} revealing={revealing} revealRequest={revealRequest?.person.id === selectedPerson.id ? revealRequest.type : null} revealedContacts={revealedContacts[selectedPerson.id]} sendingToCrm={sendingToCrm} />}
    </main>
  </div>
}

function Kpi({ label, value, detail, format = (amount) => amount.toLocaleString("pt-BR") }: { label: string; value: number; detail: string; format?: (value: number) => string }) { return <article><span>{label}</span><strong>{format(value)}</strong><small>{detail}</small></article> }
function ClassificationTester({ input, busy, result, onChange, onSubmit }: { input: { evidence: string; personName: string; role: string; company: string }; busy: boolean; result: PreviewSignalResult | null; onChange: (field: keyof typeof input, value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const statusLabel = { lead: "Lead", sinal_fraco: "Sinal fraco", fora_icp: "Fora do ICP", revisar: "Revisar" }
  return <section className="intent-v1-content"><SectionHeading primary title="Testar classificação" subtitle="Cole uma evidência pública e veja como o perfil ideal ativo interpreta o sinal. O teste não altera os dados da sua operação." /><form className="intent-v1-panel intent-v1-classifier" onSubmit={onSubmit}><div className="intent-v1-form-grid"><label>Nome da pessoa<input value={input.personName} onChange={(event) => onChange("personName", event.target.value)} placeholder="Opcional" /></label><label>Cargo<input value={input.role} onChange={(event) => onChange("role", event.target.value)} placeholder="Ex.: CTO" /></label><label>Empresa e porte<input value={input.company} onChange={(event) => onChange("company", event.target.value)} placeholder="Ex.: Empresa · 1000+" /></label></div><label>Evidência pública<textarea required value={input.evidence} onChange={(event) => onChange("evidence", event.target.value)} placeholder="Cole aqui o comentário ou atividade pública que deseja avaliar." /></label><div className="intent-v1-classifier-actions"><small>A avaliação segue a mesma régua do seu perfil ideal ativo.</small><Button disabled={busy || !input.evidence.trim()} type="submit">{busy ? <><Spinner label="Avaliando o sinal" />Avaliando…</> : <><FlaskConical size={15} />Avaliar sinal</>}</Button></div></form>{result && <section className="intent-v1-panel intent-v1-verdict" aria-live="polite"><div className="intent-v1-verdict-heading"><div><span className={`intent-v1-verdict-status is-${result.status}`}>{statusLabel[result.status]}</span><h3>{result.judgment.score}% de intenção</h3></div><span><CheckCircle2 size={18} />Avaliação concluída</span></div><div className="intent-v1-verdict-grid"><div><strong>Critério identificado</strong><span>{result.judgment.rule === "nenhuma" ? "Nenhum critério específico" : result.judgment.rule}</span></div><div><strong>Evidência original</strong><span>Trecho preservado abaixo</span></div></div><blockquote>{result.judgment.evidence}</blockquote><small>Esta avaliação é apenas uma prévia e não altera sua lista de pessoas.</small></section>}</section>
}
function Bucket({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) { return <button className={active ? "is-active" : ""} onClick={onClick} type="button">{label}<small>{count}</small></button> }
function SectionHeading({ title, subtitle, action, primary = false }: { title: string; subtitle: string; action?: ReactNode; primary?: boolean }) { return <div className="intent-v1-section-heading"><div>{primary ? <h1>{title}</h1> : <h2>{title}</h2>}<p>{subtitle}</p></div>{action}</div> }
function Empty({ text }: { text: string }) { return <div className="intent-v1-empty"><LayoutList size={20} /><p>{text}</p></div> }
function PersonRow({ person, evidence }: { person: SignalPerson; evidence?: SignalComment }) { return <article className="intent-v1-row"><span className="intent-v1-avatar">{initials(person.name)}</span><div><strong>{person.name}</strong><p>{personSubline(person)}</p>{evidence && <q>{evidence.text}</q>}</div><aside><b>{person.priorityScore ?? person.intentScore ?? person.comments}</b><small>{person.priorityLabel ?? (person.intentScore === null ? "sinais" : "prioridade")}</small></aside></article> }
function CompanyRow({ company }: { company: SignalCompany }) { return <article className="intent-v1-row"><span className="intent-v1-avatar is-company"><Building2 size={17} /></span><div><strong>{company.name}</strong><p>{[company.size, company.sector].filter(Boolean).join(" · ") || "Conta identificada"}</p></div><aside><b>{company.people}</b><small>{company.people === 1 ? "pessoa" : "pessoas"}</small></aside></article> }
function SourceRow({ source, busyId = null, onStatusChange }: { source: SignalSource; busyId?: string | null; onStatusChange?: (source: SignalSource, status: "monitorada" | "descartada") => void }) { const pending = source.status === "candidata"; const postsLabel = source.posts === 1 ? "post" : "posts"; const interactionsLabel = source.comments === 1 ? "interação pública" : "interações públicas"; return <article className="intent-v1-source"><div><strong>{source.name ?? "Perfil público"}</strong><p>{source.posts} {postsLabel} · {source.comments} {interactionsLabel}</p></div><div className="intent-v1-source-actions">{pending && onStatusChange ? <><span>Sugestão</span><Button disabled={busyId === source.id} onClick={() => onStatusChange(source, "monitorada")} size="sm">{busyId === source.id ? <><Spinner label={`Aprovando ${source.name ?? "sugestão"}`} />Aprovando…</> : "Aprovar"}</Button><Button disabled={busyId === source.id} onClick={() => onStatusChange(source, "descartada")} size="sm" variant="outline">Descartar</Button></> : <span className={source.status === "monitorada" ? "is-active" : ""}>{source.status === "monitorada" ? "Acompanhando" : "Sugestão"}</span>}</div></article> }
function SourcePanel({ title, subtitle, sources, busyId, onStatusChange }: { title: string; subtitle: string; sources: SignalSource[]; busyId: string | null; onStatusChange: (source: SignalSource, status: "monitorada" | "descartada") => void }) { return <section className="intent-v1-panel"><header><div><h3>{title}</h3><p>{subtitle}</p></div><span className="intent-v1-count">{sources.length}</span></header>{sources.map((source) => <SourceRow busyId={busyId} key={source.id} onStatusChange={onStatusChange} source={source} />)}{sources.length === 0 && <Empty text="Nenhum item deste tipo está em acompanhamento." />}</section> }
function statusLabel(status: string | null) {
  if (status === "lead") return "Lead"
  if (status === "sinal_fraco") return "Sinal fraco"
  if (status === "cliente") return "Cliente"
  if (status === "fora_icp") return "Fora do ICP"
  return "Em análise"
}

function signalLabel(type: string | undefined) {
  return {
    comentou_tema: "💬 Comentou em post sobre tema do ICP",
    pediu_indicacao: "🙋 Pediu indicação de fornecedor",
    mudou_cargo: "🔄 Mudou de cargo",
    engajou_concorrente: "🥊 Engajou com concorrente da watchlist",
    engajou_influenciador: "👁️ Engajou com perfil da watchlist",
    compartilhou_tema: "🔁 Compartilhou conteúdo sobre tema do ICP",
    atividade_fraca: "👀 Reagiu a posts sobre temas do ICP",
  }[type ?? ""] ?? "👀 Sinal público capturado"
}

function statusClass(status: string | null) {
  if (status === "lead") return "is-lead"
  if (status === "sinal_fraco") return "is-weak"
  if (status === "cliente") return "is-client"
  if (status === "fora_icp") return "is-out"
  return ""
}

function PeopleTable({ people, commentsByPerson, onSelect }: { people: SignalPerson[]; commentsByPerson: Map<string, SignalComment>; onSelect: (person: SignalPerson) => void }) {
  function openFromKeyboard(event: KeyboardEvent<HTMLTableRowElement>, person: SignalPerson) {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    onSelect(person)
  }

  return <table className="intent-v1-table intent-v1-people-table"><thead><tr><th>Pessoa</th><th>Status</th><th>Intenção</th><th>Sinal · evidência</th></tr></thead><tbody>{people.map((person) => {
    const evidence = commentsByPerson.get(person.id)
    const displayScore = person.intentScore ?? person.priorityScore
    return <tr aria-label={`Abrir detalhes de ${person.name}`} className="intent-v1-person-row" key={person.id} onClick={() => onSelect(person)} onKeyDown={(event) => openFromKeyboard(event, person)} tabIndex={0}><td><div className="intent-v1-person-cell"><span className="intent-v1-avatar">{initials(person.name)}</span><div><strong>{person.name}</strong><small>{personDrawerSubline(person)}</small></div></div></td><td><span className={`intent-v1-person-status ${statusClass(person.intentStatus)}`}>{statusLabel(person.intentStatus)}</span></td><td><span className={`intent-v1-intent ${person.intentStatus === "lead" ? "is-strong" : ""}`}>⚡ {displayScore ?? "—"}</span></td><td>{evidence ? <><span className="intent-v1-signal-pill">{signalLabel(evidence.signalType ?? evidence.tone ?? undefined)}</span><q>{evidence.text}</q></> : <small>Sem evidência textual disponível</small>}</td></tr>
  })}</tbody></table>
}

function PersonDrawer({ person, comments, error, notice, markingClient, sendingToCrm, revealing, revealRequest, revealedContacts, onCancelReveal, onClose, onConfirmReveal, onMarkClient, onReveal, onSendToCrm }: { person: SignalPerson; comments: SignalComment[]; error: string; notice: string; markingClient: boolean; sendingToCrm: boolean; revealing: boolean; revealRequest: RevealContactType | null; revealedContacts?: Partial<Record<RevealContactType, string>>; onCancelReveal: () => void; onClose: () => void; onConfirmReveal: () => void; onMarkClient: () => void; onReveal: (type: RevealContactType) => void; onSendToCrm: () => void }) {
  const evidence = comments.filter((comment) => comment.personId === person.id).sort((a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime())[0]
  const fitDetails = [person.role && `cargo (${person.role})`, person.companySector && `setor (${person.companySector})`, person.companySize && `porte (${person.companySize})`].filter(Boolean).join(", ")
  const fitReason = person.icpReason ?? (person.icp === false ? "Este perfil não confirmou aderência ao perfil ideal ativo." : `Este perfil passou pela régua do perfil ideal ativo${fitDetails ? `. Dados públicos considerados: ${fitDetails}` : ""}.`)
  const ruleLabel = evidence?.rule && evidence.rule !== "nenhuma" ? evidence.rule : "Nenhuma regra específica foi registrada neste sinal"
  const score = person.intentScore ?? person.priorityScore ?? 0
  const strength = person.intentStatus === "lead" || score >= 80 ? "forte" : "fraca"
  const revealLabel = revealRequest === "email" ? "e-mail" : "telefone"
  const revealCredits = revealRequest === "email" ? 1 : 10
  return <div className="intent-v1-drawer-layer" role="presentation"><button aria-label="Fechar detalhes" className="intent-v1-drawer-backdrop" onClick={onClose} type="button" /><aside aria-label={`Detalhes de ${person.name}`} aria-modal="true" className="intent-v1-drawer" role="dialog"><header><div><div className="intent-v1-drawer-name"><h2>{person.name}</h2><span className={`intent-v1-person-status ${statusClass(person.intentStatus)}`}>{statusLabel(person.intentStatus)}</span></div><p>{personDrawerSubline(person)}</p></div><button aria-label="Fechar detalhes" className="intent-v1-drawer-close" onClick={onClose} type="button">×</button></header><div className="intent-v1-drawer-body">{error && <div className="intent-v1-error" role="alert"><CircleAlert size={16} />{error}</div>}{notice && <div className="intent-v1-notice" role="status"><CheckCircle2 size={16} />{notice}</div>}<div className="intent-v1-drawer-score"><span>Intenção · {strength}</span><strong>⚡ {score}</strong></div><p className="intent-v1-drawer-explainer">Todo mundo aqui já passou pelo filtro do seu ICP. <strong>Sinal</strong> é o que aconteceu, <strong>evidência</strong> é a prova literal e <strong>intenção</strong> é a nota dada ao conjunto, usando suas dores e gatilhos como régua.</p><section className="intent-v1-drawer-block"><h3>Por que {person.icp === false ? "está fora do ICP" : "é ICP"}</h3><p>{fitReason}</p></section><section className="intent-v1-drawer-block"><h3>Sinal capturado</h3>{evidence ? <><span className="intent-v1-signal-pill">{signalLabel(evidence.signalType ?? evidence.tone ?? undefined)}</span><blockquote>{evidence.text}</blockquote><p>Por que essa nota de intenção, <strong>{ruleLabel}</strong></p></> : <p>Nenhuma evidência textual foi registrada para este perfil.</p>}</section><section className="intent-v1-drawer-block"><h3>Contato</h3>{revealRequest && <div className="intent-v1-drawer-confirm" aria-live="polite"><strong>Revelar {revealLabel} de {person.name}?</strong><p>A consulta usa {revealCredits} crédito{revealCredits === 1 ? "" : "s"} somente se um contato for disponibilizado.</p><div><Button disabled={revealing} onClick={onCancelReveal} size="sm" variant="outline">Cancelar</Button><Button disabled={revealing} onClick={onConfirmReveal} size="sm">{revealing ? <><Spinner label={`Consultando ${revealLabel}`} />Consultando…</> : "Confirmar consulta"}</Button></div></div>}<div className="intent-v1-drawer-actions intent-v1-contact-reveal">{revealedContacts?.email ? <span className="intent-v1-revealed-contact">{revealedContacts.email} ✓</span> : <button onClick={() => onReveal("email")} type="button"><Mail size={14} />Revelar e-mail · 1 crédito</button>}{revealedContacts?.telefone ? <span className="intent-v1-revealed-contact">{revealedContacts.telefone} ✓</span> : <button onClick={() => onReveal("telefone")} type="button"><Phone size={14} />Revelar telefone · 10 créditos</button>}</div><div className="intent-v1-drawer-actions intent-v1-primary-actions">{person.linkedinUrl && <a className="is-primary" href={person.linkedinUrl} rel="noreferrer" target="_blank">Abrir no LinkedIn</a>}<Button disabled={sendingToCrm} onClick={onSendToCrm} size="sm" variant="outline">{sendingToCrm ? <><Spinner label="Enviando pessoa ao CRM" />Enviando…</> : "Enviar para o CRM"}</Button>{person.intentStatus !== "cliente" && <Button disabled={markingClient} onClick={onMarkClient} size="sm" variant="outline">{markingClient ? <><Spinner label="Salvando cliente" />Salvando…</> : "Marcar como cliente"}</Button>}</div><small>Ao marcar como cliente, esta pessoa sai da fila de abordagem e passa a ser desconsiderada nas próximas sugestões.</small></section></div></aside></div>
}
function CompaniesTable({ companies }: { companies: SignalCompany[] }) { return <table className="intent-v1-table intent-v1-companies-table"><thead><tr><th>Empresa</th><th>Pessoas</th><th>Sinais</th><th>Nível</th></tr></thead><tbody>{companies.map((company) => <tr key={company.id}><td><div className="intent-v1-company-cell"><strong>{company.name}</strong><small>{[company.size, company.sector].filter(Boolean).join(" · ") || "Conta identificada"}</small></div></td><td>{company.people}</td><td><span className="intent-v1-company-signals">{company.signalSummary ?? "Sinal público registrado"}</span></td><td><span className={`intent-v1-level ${company.level === "em_movimento" ? "is-moving" : company.level === "aquecendo" ? "is-warming" : "is-cold"}`}>{company.level === "em_movimento" ? "Em movimento" : company.level === "aquecendo" ? "Aquecendo" : "Fria"}</span></td></tr>)}</tbody></table> }
