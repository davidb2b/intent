import { useEffect, useState, type FormEvent } from "react"
import {
  BarChart3,
  Building2,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileText,
  LayoutDashboard,
  MessageCircle,
  Play,
  Settings2,
  Users,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { discoverSources } from "@/features/collection/services/discover-sources"
import { runMonitoring } from "@/features/collection/services/run-monitoring"
import { updateSourceStatus } from "@/features/collection/services/update-source-status"
import { classifyComments } from "@/features/classification/services/classify-comments"
import { commentToneLabel, matchesCommentFilter } from "@/features/classification/lib/comment-tone"
import { analyzePosts } from "@/features/classification/services/analyze-posts"
import { updatePostCuration, type CurationStatus } from "@/features/posts/services/update-post-curation"
import { reviewPerson, seniorityOptions, type PersonSeniority } from "@/features/people/services/review-person"
import { loadSignalComments, loadSignalCompanies, loadSignalPeople, loadSignalPosts, loadSignalSources, loadSignalSummary, type SignalComment, type SignalCompany, type SignalPerson, type SignalPost, type SignalSource, type SignalSummary } from "@/features/analytics/services/load-signals"
import { getOverviewMetrics, getTopCompanies, getUsefulComments } from "@/features/analytics/lib/overview"
import { authService } from "@/features/auth/services/auth-service"
import { saveResearch } from "@/features/research/services/save-research"
import "./App.css"

type View = "overview" | "posts" | "comments" | "companies" | "people"
type CollectionState = "idle" | "running" | "success" | "error"
type AuthMode = "signin" | "signup" | "recovery" | "update-password"
type AuthSession = { email: string; userId: string }
type CommentFilter = "all" | "pain" | "question" | "experience" | "generic"
type PostsMode = "search" | "sources"
type PeopleFilter = "all" | "icp" | "without-icp"

const pathByView: Record<View, string> = {
  overview: "/overview",
  posts: "/posts",
  comments: "/comments",
  companies: "/companies",
  people: "/people",
}

function viewFromPath(pathname: string): View {
  const entry = Object.entries(pathByView).find(([, path]) => path === pathname)
  return (entry?.[0] as View | undefined) ?? "overview"
}

function formatDate(value: string | null) {
  if (!value) return "Data não informada"
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value))
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(value)
}

function formatExecutionStatus(status: string) {
  return status === "concluida" ? "Concluída" : status === "rodando" ? "Em andamento" : status === "abortada_por_custo" ? "Abortada por custo" : "Falhou"
}

function stateFromLatestExecution(summary: SignalSummary): CollectionState {
  const latest = summary.executionHistory[0]
  if (latest?.status === "rodando") return "running"
  if (latest?.status === "falhou" || latest?.status === "abortada_por_custo") return "error"
  return "idle"
}

function shorten(value: string | null, length = 180) {
  if (!value) return "Sem texto disponível."
  return value.length > length ? `${value.slice(0, length).trim()}…` : value
}

function displayLinkedInUrl(value: string) {
  try {
    const url = new URL(value)
    if (/(^|\.)linkedin\.com$/i.test(url.hostname)) {
      return `${url.hostname}${decodeURIComponent(url.pathname).replace(/\/$/, "")}`
    }
  } catch {
    // Keep the source value visible when an external provider returns a URL
    // outside the expected format.
  }
  return value
}

const navigation: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "posts", label: "Posts", icon: FileText },
  { id: "comments", label: "Comentários", icon: MessageCircle },
  { id: "companies", label: "Empresas", icon: Building2 },
  { id: "people", label: "Pessoas", icon: Users },
]

const viewCopy: Record<View, { eyebrow: string; subtitle: string; title: string; description: string }> = {
  overview: {
    eyebrow: "Visão geral",
    subtitle: "Da palavra-chave às empresas e pessoas que participam da conversa.",
    title: "Nenhum sinal coletado ainda",
    description: "Configure uma pesquisa para começar a encontrar conversas públicas sobre um tema.",
  },
  posts: {
    eyebrow: "Posts",
    subtitle: "Posts públicos encontrados para o tema monitorado.",
    title: "Nenhum post disponível",
    description: "Os posts encontrados pela coleta aparecerão aqui, sem dados fictícios.",
  },
  comments: {
    eyebrow: "Comentários",
    subtitle: "Comentários públicos que sinalizam interesse no tema.",
    title: "Nenhum comentário disponível",
    description: "Os comentários coletados e classificados aparecerão aqui.",
  },
  companies: {
    eyebrow: "Empresas",
    subtitle: "Contas identificadas a partir da participação nas conversas.",
    title: "Nenhuma empresa identificada",
    description: "As empresas observadas nas conversas aparecerão aqui quando houver uma coleta.",
  },
  people: {
    eyebrow: "Pessoas",
    subtitle: "Pessoas que demonstraram interesse nos conteúdos monitorados.",
    title: "Nenhuma pessoa identificada",
    description: "As pessoas que demonstram interesse no tema aparecerão aqui.",
  },
}

function App() {
  const [activeView, setActiveView] = useState<View>(() => viewFromPath(window.location.pathname))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [keyword, setKeyword] = useState("")
  const [positiveContext, setPositiveContext] = useState("")
  const [negativeContext, setNegativeContext] = useState("")
  const [collectionState, setCollectionState] = useState<CollectionState>("idle")
  const [collectionMessage, setCollectionMessage] = useState("")
  const [session, setSession] = useState<AuthSession | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>("signin")
  const [authEmail, setAuthEmail] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [authPasswordVisible, setAuthPasswordVisible] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState("")
  const [signalSummary, setSignalSummary] = useState<SignalSummary | null>(null)
  const [signalPosts, setSignalPosts] = useState<SignalPost[]>([])
  const [signalSources, setSignalSources] = useState<SignalSource[]>([])
  const [signalCompanies, setSignalCompanies] = useState<SignalCompany[]>([])
  const [signalPeople, setSignalPeople] = useState<SignalPerson[]>([])
  const [peopleFilter, setPeopleFilter] = useState<PeopleFilter>("all")
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)
  const [postsMode, setPostsMode] = useState<PostsMode>("search")
  const [signalComments, setSignalComments] = useState<SignalComment[]>([])
  const [commentFilter, setCommentFilter] = useState<CommentFilter>("all")
  const [commentSearch, setCommentSearch] = useState("")
  const [summaryError, setSummaryError] = useState("")
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [classificationBusy, setClassificationBusy] = useState(false)
  const [postAnalysisBusy, setPostAnalysisBusy] = useState(false)
  const [personUnderReview, setPersonUnderReview] = useState<SignalPerson | null>(null)
  const [reviewRole, setReviewRole] = useState("")
  const [reviewSeniority, setReviewSeniority] = useState<PersonSeniority>("fora")
  const [reviewIcp, setReviewIcp] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)

  const content = viewCopy[activeView]
  const recentExecutions = signalSummary?.executionHistory.slice(0, 5) ?? []
  const overviewMetrics = getOverviewMetrics(signalPosts, signalSources, signalComments, signalCompanies)
  const usefulComments = getUsefulComments(signalComments)
  const topCompanies = getTopCompanies(signalCompanies)

  useEffect(() => {
    const updateSession = (nextSession: { user?: { id: string; email?: string } } | null) => {
      setSession(nextSession?.user?.email ? { email: nextSession.user.email, userId: nextSession.user.id } : null)
    }
    void authService.getSession().then(({ data }) => updateSession(data.session))
    const { data: listener } = authService.onAuthStateChange((event, nextSession) => {
      updateSession(nextSession)
      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("update-password")
        setAuthOpen(true)
      }
    })
    const onPopState = () => setActiveView(viewFromPath(window.location.pathname))
    window.addEventListener("popstate", onPopState)
    if (window.location.pathname === "/") window.history.replaceState({}, "", "/overview")
    return () => {
      listener.subscription.unsubscribe()
      window.removeEventListener("popstate", onPopState)
    }
  }, [])

  useEffect(() => {
    if (!session) {
      setSignalSummary(null)
      setSignalPosts([])
      setSignalSources([])
      setSignalCompanies([])
      setSignalPeople([])
      setSelectedPostId(null)
      setSignalComments([])
      setSummaryError("")
      setSummaryLoading(false)
      return
    }
    let active = true
    setSummaryError("")
    setSummaryLoading(true)
    void loadSignalSummary(session.userId)
      .then(async (summary) => {
        if (!active) return
        setSignalSummary(summary)
        setCollectionState(stateFromLatestExecution(summary))
        setCollectionMessage(summary.executionHistory[0]?.status === "falhou" || summary.executionHistory[0]?.status === "abortada_por_custo"
          ? summary.executionHistory[0].error ?? "A última coleta não foi concluída."
          : "")
        setKeyword(summary.keyword ?? "")
        setPositiveContext(summary.positiveContext ?? "")
        setNegativeContext(summary.negativeContext ?? "")
        if (summary.projectId) {
          const [posts, comments, sources, companies, people] = await Promise.all([loadSignalPosts(summary.projectId), loadSignalComments(summary.projectId), loadSignalSources(summary.projectId), loadSignalCompanies(summary.projectId), loadSignalPeople(summary.projectId)])
          if (active) { setSignalPosts(posts); setSignalComments(comments); setSignalSources(sources); setSignalCompanies(companies); setSignalPeople(people) }
        }
      })
      .catch((error) => { if (active) setSummaryError(error instanceof Error ? error.message : "Não foi possível ler os sinais.") })
      .finally(() => { if (active) setSummaryLoading(false) })
    return () => { active = false }
  }, [session])

  useEffect(() => {
    if (signalPosts.length === 0) {
      setSelectedPostId(null)
      return
    }
    setSelectedPostId((current) => current && signalPosts.some((post) => post.id === current) ? current : signalPosts[0].id)
  }, [signalPosts])

  function navigate(view: View) {
    setActiveView(view)
    window.history.pushState({}, "", pathByView[view])
  }

  async function handleCollect() {
    if (!keyword.trim() || !session || collectionState === "running") {
      if (!session) { setAuthOpen(true); setCollectionMessage("Faça login para iniciar uma coleta real.") }
      return
    }
    setCollectionState("running")
    setCollectionMessage("Executando coleta real no Apify…")
    try {
      if (!signalSummary?.projectId) throw new Error("Salve a configuração da pesquisa antes de iniciar uma coleta.")
      const result = await runMonitoring(signalSummary.projectId)
      setCollectionState("success")
      setCollectionMessage(`${result.postsRead} posts e ${result.commentsRead} comentários monitorados.`)
      const refreshedSummary = await loadSignalSummary(session.userId)
      setSignalSummary(refreshedSummary)
      if (refreshedSummary.projectId) {
        const [posts, comments, sources, companies, people] = await Promise.all([loadSignalPosts(refreshedSummary.projectId), loadSignalComments(refreshedSummary.projectId), loadSignalSources(refreshedSummary.projectId), loadSignalCompanies(refreshedSummary.projectId), loadSignalPeople(refreshedSummary.projectId)])
        setSignalPosts(posts)
        setSignalComments(comments)
        setSignalSources(sources)
        setSignalCompanies(companies)
        setSignalPeople(people)
      }
    } catch (error) {
      setCollectionState("error")
      setCollectionMessage(error instanceof Error ? error.message : "Não foi possível executar a coleta.")
    }
  }

  async function handleDiscover() {
    if (!keyword.trim() || !session || collectionState === "running") {
      if (!session) { setAuthOpen(true); setCollectionMessage("Faça login para descobrir fontes reais.") }
      return
    }
    setCollectionState("running")
    setCollectionMessage("Descobrindo fontes brasileiras no Apify…")
    try {
      if (!signalSummary?.projectId) throw new Error("Salve a configuração da pesquisa antes de descobrir fontes.")
      const result = await discoverSources(signalSummary.projectId, [keyword])
      const sources = await loadSignalSources(signalSummary.projectId)
      setSignalSources(sources)
      setCollectionState("success")
      if (result.postsFound === 0) {
        setCollectionMessage("Nenhum post foi encontrado para esta pesquisa. Ajuste a palavra-chave ou os contextos e tente novamente.")
      } else {
        setCollectionMessage(`${result.candidatesInserted} fontes candidatas encontradas; ${result.candidatesRejected} perfis não brasileiros descartados; ${result.candidatesUnverified} perfis pendentes de verificação.`)
      }
    } catch (error) {
      setCollectionState("error")
      setCollectionMessage(error instanceof Error ? error.message : "Não foi possível descobrir fontes.")
    }
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthBusy(true)
    setAuthError("")
    const result = authMode === "signin"
      ? await authService.signInWithPassword(authEmail, authPassword)
      : authMode === "signup"
        ? await authService.signUp(authEmail, authPassword)
        : authMode === "recovery"
          ? await authService.resetPasswordForEmail(authEmail, `${window.location.origin}/reset-password`)
          : await authService.updatePassword(authPassword)
    setAuthBusy(false)
    if (result.error) { setAuthError(result.error.message); return }
    setAuthOpen(false)
    setCollectionMessage(authMode === "signup" ? "Conta criada. Verifique seu e-mail se a confirmação estiver habilitada." : authMode === "recovery" ? "Enviamos o link de recuperação para seu e-mail." : authMode === "update-password" ? "Senha atualizada com sucesso." : "Login realizado.")
  }

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session || !keyword.trim()) return
    setCollectionState("running")
    setCollectionMessage("Salvando configuração da pesquisa…")
    try {
      const saved = await saveResearch({ ownerId: session.userId, keyword, positiveContext, negativeContext })
      setSignalSummary((summary) => summary ? { ...summary, projectId: saved.projectId, keyword: saved.keyword, positiveContext: saved.positiveContext, negativeContext: saved.negativeContext } : { projectId: saved.projectId, posts: 0, comments: 0, people: 0, companies: 0, lastExecutionAt: null, keyword: saved.keyword, positiveContext: saved.positiveContext, negativeContext: saved.negativeContext, lastExecutionOrigin: null, monthlyCostUsd: 0, estimatedNextCostUsd: 0, monitoredSources: 0, executionHistory: [] })
      setSettingsOpen(false)
      setCollectionState("success")
      setCollectionMessage("Configuração salva. Escolha descobrir fontes ou atualizar o monitoramento.")
    } catch (error) {
      setCollectionState("error")
      setCollectionMessage(error instanceof Error ? error.message : "Não foi possível salvar a configuração.")
    }
  }

  async function handleLogout() {
    const { error } = await authService.signOut()
    if (error) setCollectionMessage(error.message)
    else setCollectionMessage("Sessão encerrada.")
  }

  function commentMatchesFilter(comment: SignalComment) {
    return matchesCommentFilter(comment.tone, commentFilter)
  }

  function visibleComments() {
    const query = commentSearch.trim().toLowerCase()
    return signalComments.filter((comment) => {
      if (!commentMatchesFilter(comment)) return false
      if (!query) return true
      return [comment.personName, comment.personHeadline, comment.companyName, comment.text, comment.tone].some((value) => value?.toLowerCase().includes(query))
    })
  }

  function visiblePeople() {
    return signalPeople.filter((person) => peopleFilter === "all" || (peopleFilter === "icp" ? person.icp === true : person.icp !== true))
  }

  const selectedPost = signalPosts.find((post) => post.id === selectedPostId) ?? signalPosts[0]
  const selectedCompany = signalCompanies.find((company) => company.id === selectedCompanyId) ?? signalCompanies[0]

  function exportComments() {
    const rows = [["Pessoa", "Empresa", "Cargo", "Teor", "Comentário", "Data", "Perfil", "Post"], ...visibleComments().map((comment) => [comment.personName, comment.companyName ?? "", comment.personHeadline ?? "", comment.tone ?? "", comment.text, formatDate(comment.publishedAt), comment.personUrl, comment.postUrl])]
    const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(";")).join("\n")
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }))
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "signal-lab-comentarios.csv"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function handleClassifyComments() {
    if (!signalSummary?.projectId || classificationBusy) return
    setClassificationBusy(true)
    setCollectionMessage("Classificando comentários reais…")
    try {
      const result = await classifyComments(signalSummary.projectId)
      const [comments, summary] = await Promise.all([loadSignalComments(signalSummary.projectId), loadSignalSummary(session?.userId ?? "")])
      setSignalComments(comments)
      setSignalSummary(summary)
      setCollectionMessage(result.classified ? `${result.classified} comentários classificados. ${result.remaining} pendentes.` : "Nenhum comentário pendente para classificar.")
    } catch (error) {
      setCollectionMessage(error instanceof Error ? error.message : "Não foi possível classificar os comentários.")
    } finally {
      setClassificationBusy(false)
    }
  }

  async function handleAnalyzePosts() {
    if (!signalSummary?.projectId || postAnalysisBusy) return
    setPostAnalysisBusy(true)
    setCollectionMessage("Analisando posts reais…")
    try {
      const result = await analyzePosts(signalSummary.projectId)
      const posts = await loadSignalPosts(signalSummary.projectId)
      setSignalPosts(posts)
      setCollectionMessage(result.analyzed ? "Análise do post concluída." : "Nenhum post pendente para analisar.")
    } catch (error) {
      setCollectionMessage(error instanceof Error ? error.message : "Não foi possível analisar os posts.")
    } finally { setPostAnalysisBusy(false) }
  }

  async function handleCuration(postId: string, status: CurationStatus) {
    try {
      await updatePostCuration(postId, status)
      setSignalPosts((posts) => posts.map((post) => post.id === postId ? { ...post, curationStatus: status } : post))
      setCollectionState("success")
      setCollectionMessage(status === "aprovado" ? "Post aprovado para monitoramento." : "Post descartado da curadoria.")
    } catch (error) {
      setCollectionState("error")
      setCollectionMessage(error instanceof Error ? error.message : "Não foi possível salvar a decisão do post.")
    }
  }

  async function handleSourceStatus(sourceId: string, status: "monitorada" | "descartada") {
    try {
      await updateSourceStatus(sourceId, status)
      setSignalSources((sources) => sources.map((source) => source.id === sourceId ? { ...source, status } : source))
      setCollectionState("success")
      setCollectionMessage(status === "monitorada" ? "Fonte aprovada para o monitoramento." : "Fonte descartada.")
    } catch (error) {
      setCollectionState("error")
      setCollectionMessage(error instanceof Error ? error.message : "Não foi possível atualizar a fonte.")
    }
  }

  function openPersonReview(person: SignalPerson) {
    setPersonUnderReview(person)
    setReviewRole(person.role ?? "")
    setReviewSeniority((person.seniority ?? "fora") as PersonSeniority)
    setReviewIcp(person.icp === true)
  }

  async function handlePersonReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!personUnderReview || reviewBusy || !signalSummary?.projectId) return
    setReviewBusy(true)
    try {
      await reviewPerson({ personId: personUnderReview.id, role: reviewRole, seniority: reviewSeniority, icp: reviewIcp })
      const people = await loadSignalPeople(signalSummary.projectId)
      setSignalPeople(people)
      setPersonUnderReview(null)
      setCollectionMessage("Revisão humana salva. A classificação automática não substituirá esses campos.")
    } catch (error) {
      setCollectionMessage(error instanceof Error ? error.message : "Não foi possível salvar a revisão da pessoa.")
    } finally {
      setReviewBusy(false)
    }
  }

  return (
    <div className="signal-shell">
      <aside className="signal-sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">S</div>
          <div>
            <strong>Signal Lab</strong>
            <span>Inteligência temática</span>
          </div>
        </div>

        <div className="workspace-selector" aria-label="Pesquisa ativa">
          <span>Pesquisa ativa</span>
          <strong>{keyword || "Nenhuma configurada"}</strong>
          <ChevronDown size={15} aria-hidden="true" />
        </div>

        <nav className="main-nav" aria-label="Navegação principal">
          {navigation.map(({ id, label, icon: Icon }, index) => (
            <button
              className={`nav-item ${activeView === id ? "is-active" : ""}`}
              key={id}
              onClick={() => navigate(id)}
              type="button"
            >
              <span className="nav-index">0{index + 1}</span>
              <Icon size={16} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="cost-box"><p className="eyebrow">Gasto desta pesquisa</p><strong>{formatCurrency(signalSummary?.monthlyCostUsd ?? 0)}</strong><div className="cost-bar"><span style={{ width: `${Math.min(((signalSummary?.monthlyCostUsd ?? 0) / 300) * 100, 100)}%` }} /></div><small>Teto de US$ 300,00 no mês{(signalSummary?.monthlyCostUsd ?? 0) >= 225 ? " · Atenção" : ""}</small></div>
          <div className="status-line"><span className="status-dot" /> Ambiente preparado</div>
          <button className="help-link" type="button"><CircleHelp size={15} /> Ajuda</button>
        </div>
      </aside>

      <main className="signal-main">
        <header className="topbar">
          <div>
            <p className="breadcrumb">Signal Lab <span>/</span> {content.eyebrow}</p>
            <h1>{content.eyebrow}</h1>
            <p className="page-subtitle">{content.subtitle}</p>
          </div>
          <div className="topbar-actions">
            <Button className="settings-button" onClick={() => setSettingsOpen(true)} variant="outline"><Settings2 size={16} /> Configurar pesquisa</Button>
            {session ? <><span className="session-label">{session.email}</span><Button onClick={handleLogout} variant="outline">Sair</Button></> : <Button onClick={() => { setAuthMode("signin"); setAuthOpen(true) }} variant="outline">Entrar</Button>}
          </div>
        </header>

        <section className="query-bar" aria-label="Termo monitorado">
          <div className="query-icon"><BarChart3 size={18} /></div>
          <div className="query-value">
            <span>Termo monitorado</span>
            <strong>{keyword || "Nenhum termo definido"}</strong>
          </div>
          <div className="query-context">
            {positiveContext || negativeContext ? (
              <span>Contexto: {positiveContext || "—"} · Exclusões: {negativeContext || "—"}</span>
            ) : (
              <span>Defina o contexto para iniciar uma pesquisa</span>
            )}
          </div>
        </section>

        <section className="collection-bar" aria-label="Status da coleta">
          <div className={`collection-status collection-${collectionState}`}><span className="status-dot" /> {collectionState === "running" ? "Coleta em andamento" : collectionState === "success" ? "Coleta concluída" : collectionState === "error" ? "Coleta com erro" : signalSummary?.lastExecutionAt ? `Última coleta ${formatDate(signalSummary.lastExecutionAt)}` : "Coleta não iniciada"}</div>
          <div className="collection-meta"><Clock3 size={15} /> Próxima: segunda, 06h</div>
          <div className="collection-meta"><span className="cost-label">Próxima estimativa</span> {formatCurrency(signalSummary?.estimatedNextCostUsd ?? 0)}</div>
          <div className="collection-actions">
            <Button className="discover-button" variant="outline" disabled={!keyword.trim() || !session || collectionState === "running"} onClick={handleDiscover}>Descobrir fontes</Button>
            <Button className="collect-button" disabled={!keyword.trim() || !session || collectionState === "running"} onClick={handleCollect}>
              <Play size={14} /> {collectionState === "running" ? "Coletando…" : "Atualizar agora"}
            </Button>
          </div>
        </section>

        {collectionMessage && <p aria-live="polite" className={`collection-message collection-message-${collectionState}`}>{collectionMessage}</p>}

        <section className="content-area">
          {summaryError && <p aria-live="polite" className="collection-message collection-message-error">{summaryError}</p>}
          {activeView !== "overview" && session && signalSummary?.projectId && <div className="signal-metrics" aria-label="Resumo dos sinais coletados">
            <div><span>Posts</span><strong>{signalSummary.posts}</strong></div>
            <div><span>Comentários</span><strong>{signalSummary.comments}</strong></div>
            <div><span>Pessoas</span><strong>{signalSummary.people}</strong></div>
            <div><span>Empresas</span><strong>{signalSummary.companies}</strong></div>
          </div>}
          {activeView === "overview" && session && signalSummary?.projectId && <>
            <section className="overview-workspace" aria-label="Visão geral dos sinais reais coletados">
              <div className="overview-stats">
                <div className="overview-stat"><span>Resultados iniciais</span><strong>{overviewMetrics.initialResults}</strong></div>
                <div className="overview-stat"><span>Posts aprovados</span><strong>{overviewMetrics.approvedPosts}</strong></div>
                <div className="overview-stat"><span>Autores monitorados</span><strong>{overviewMetrics.monitoredAuthors}</strong></div>
                <div className="overview-stat is-current"><span>Comentários analisados</span><strong>{overviewMetrics.analyzedComments}</strong></div>
                <div className="overview-stat"><span>Empresas identificadas</span><strong>{overviewMetrics.identifiedCompanies}</strong></div>
              </div>
              <div className="overview-grid">
                <section className="signal-panel overview-panel">
                  <div className="panel-heading"><div><h2>O que as pessoas estão dizendo</h2><p>Comentários com maior utilidade para investigação.</p></div><Button type="button" size="sm" variant="outline" onClick={() => navigate("comments")}>Ver todos</Button></div>
                  {usefulComments.length > 0 ? <div className="overview-comment-list">{usefulComments.map((comment) => <article className="overview-comment-card" key={comment.id}>
                    <div className="comment-avatar">{comment.personName.slice(0, 1).toUpperCase()}</div>
                    <div className="overview-comment-content"><strong>{comment.personName}</strong><span>{comment.personHeadline ?? "Perfil público"} · {comment.companyName ?? "Empresa não identificada"}</span><p>“{shorten(comment.text, 220)}”</p><div className="overview-comment-tags"><span className="signal-tag">{commentToneLabel(comment.tone)}</span><span>{formatDate(comment.publishedAt)}</span></div></div>
                  </article>)}</div> : <div className="overview-empty">Ainda não há comentários classificados como sinal de interesse.</div>}
                </section>
                <section className="signal-panel overview-panel">
                  <div className="panel-heading"><div><h2>Empresas mais presentes</h2><p>Consolidação dos comentaristas por conta.</p></div><Button type="button" size="sm" variant="outline" onClick={() => navigate("companies")}>Explorar</Button></div>
                  {topCompanies.length > 0 ? <div className="overview-company-list">{topCompanies.map((company) => <button className="overview-company-card" key={company.id} type="button" onClick={() => { setSelectedCompanyId(company.id); navigate("companies") }}><div className="company-avatar"><Building2 size={17} /></div><div className="company-info"><strong>{company.name}</strong><span>{company.people} pessoa{company.people === 1 ? "" : "s"} observada{company.people === 1 ? "" : "s"}</span></div><div className="company-metric"><strong>{company.comments}</strong><span>comentários</span></div></button>)}</div> : <div className="overview-empty">As empresas aparecerão aqui a partir de comentários reais coletados.</div>}
                </section>
              </div>
            </section>
            <section className="signal-panel execution-history-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Histórico</p><h2>Últimas execuções</h2><p>Acompanhe o resultado e o custo das coletas reais.</p></div>
              <span className="signal-tag">{signalSummary.executionHistory.length} registros</span>
            </div>
            {recentExecutions.length > 0 ? <>
              <div className="execution-list">{recentExecutions.map((execution) => <article className="execution-row" key={execution.id}>
                <div className="execution-identity"><strong>{execution.type === "descoberta" ? "Descoberta de fontes" : "Monitoramento"}</strong><span>{formatDate(execution.startedAt)} · {execution.origin === "agendada" ? "Agendada" : execution.origin === "manual" ? "Manual" : "Origem não informada"}</span></div>
                <div className="execution-outcome"><span>{formatExecutionStatus(execution.status)}</span><small>{execution.postsRead} posts · {execution.commentsRead} comentários</small>{execution.warnings.length > 0 && <small className="execution-warning">⚠ {execution.warnings.length} aviso(s) de truncamento</small>}</div>
                <strong className="execution-cost">{formatCurrency(execution.costUsd)}</strong>
                {execution.error && <p className="execution-error">{execution.error}</p>}
              </article>)}</div>
              {signalSummary.executionHistory.length > recentExecutions.length && <p className="execution-more">Mostrando as últimas {recentExecutions.length} execuções.</p>}
            </> : <div className="filtered-empty"><strong>Nenhuma execução registrada</strong><span>As próximas descobertas e monitoramentos aparecerão aqui.</span></div>}
            </section>
          </>}
          {activeView === "posts" && session && signalSummary?.projectId ? <div className="posts-workspace">
            <div className="mode-switch" role="tablist" aria-label="Modo de posts"><Button type="button" size="sm" variant={postsMode === "search" ? "default" : "outline"} onClick={() => setPostsMode("search")}>Resultados da busca</Button><Button type="button" size="sm" variant={postsMode === "sources" ? "default" : "outline"} onClick={() => setPostsMode("sources")}>Perfis monitorados</Button></div>
            {postsMode === "search" ? <div className="post-review-layout">
              <section className="signal-panel post-results-panel">
                <div className="panel-heading"><div><h2>Resultados da busca</h2><p>Clique em um post para revisar.</p></div><div className="panel-heading-actions"><span className="signal-tag">{signalPosts.filter((post) => post.curationStatus === "aprovado").length} válidos</span><Button type="button" size="sm" variant="outline" disabled={postAnalysisBusy || signalPosts.length === 0} onClick={handleAnalyzePosts}>{postAnalysisBusy ? "Analisando…" : "Analisar pendente"}</Button></div></div>
                <div className="post-results-list" aria-label="Lista de posts encontrados">
                  {signalPosts.map((post) => {
                    const source = signalSources.find((candidate) => candidate.linkedinUrl === post.authorUrl || candidate.name === post.authorName)
                    return <article
                      className={`post-card ${selectedPost?.id === post.id ? "is-selected" : ""}`}
                      key={post.id}
                      aria-selected={selectedPost?.id === post.id}
                      tabIndex={0}
                      onClick={() => setSelectedPostId(post.id)}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedPostId(post.id) } }}
                    >
                      <div className="post-card-tags"><span className={`curation-status curation-${post.curationStatus}`}>{post.curationStatus}</span><span className="signal-tag signal-tag-muted">{source?.status === "monitorada" ? "Perfil monitorado" : "Resultado da busca"}</span></div>
                      <h3>{shorten(post.text, 140)}</h3>
                      <div className="post-card-footer"><span>{post.authorName ?? "Autor não identificado"}</span><span>{post.comments ?? 0} comentários</span><span>{post.reactions ?? 0} reações</span></div>
                    </article>
                  })}
                </div>
              </section>
              {selectedPost && (() => {
                const source = signalSources.find((candidate) => candidate.linkedinUrl === selectedPost.authorUrl || candidate.name === selectedPost.authorName)
                return <article className="signal-panel post-detail-panel">
                  <div className="post-detail-meta"><span className={`curation-status curation-${selectedPost.curationStatus}`}>{selectedPost.curationStatus}</span><span className="signal-tag signal-tag-muted">{source?.status === "monitorada" ? "Perfil monitorado" : "Resultado da busca"}</span><span>{formatDate(selectedPost.publishedAt)}</span></div>
                  <h2 className="post-detail-title">{shorten(selectedPost.text, 180)}</h2>
                  <p className="post-detail-text">{selectedPost.text || "Sem texto disponível."}</p>
                  <div className="author-box"><div><strong>{selectedPost.authorName ?? "Autor não identificado"}</strong><span>{selectedPost.authorUrl ? displayLinkedInUrl(selectedPost.authorUrl) : "Perfil público"}</span></div>{selectedPost.authorUrl && <a href={selectedPost.authorUrl} target="_blank" rel="noreferrer">Ver perfil</a>}</div>
                  <div className="post-detail-metrics"><span>{selectedPost.reactions ?? 0} reações</span><span>{selectedPost.comments ?? 0} comentários</span><span>{selectedPost.shares ?? 0} compartilhamentos</span></div>
                  {selectedPost.analysis.topic ? <div className="post-analysis post-analysis-detail"><div><strong>Tópico identificado</strong><span>{selectedPost.analysis.topic}</span></div><div><strong>Problema discutido</strong><span>{selectedPost.analysis.problem}</span></div><div><strong>Por que o post faz sentido</strong><span>{selectedPost.analysis.reason}</span></div><div><strong>Decisão de coleta</strong><span>{selectedPost.analysis.collection}</span></div></div> : <div className="post-detail-empty">Este post ainda não foi analisado. Use “Analisar pendente” para gerar a classificação.</div>}
                  <div className="post-detail-actions"><Button type="button" size="sm" variant={selectedPost.curationStatus === "aprovado" ? "default" : "outline"} onClick={() => void handleCuration(selectedPost.id, "aprovado")}>Aprovar post</Button><Button type="button" size="sm" variant={selectedPost.curationStatus === "descartado" ? "destructive" : "outline"} onClick={() => void handleCuration(selectedPost.id, "descartado")}>Descartar post</Button><a href={selectedPost.linkedinUrl} target="_blank" rel="noreferrer">Abrir no LinkedIn</a></div>
                </article>
              })()}
            </div> : <section className="signal-panel sources-panel"><div className="panel-heading"><div><p className="eyebrow">Perfis monitorados</p><h2>{signalSources.filter((source) => source.status === "monitorada").length} fontes ativas</h2><p>As coletas semanais leem somente fontes aprovadas.</p></div><span className="signal-tag">{signalSources.length} fontes</span></div>{signalSources.length > 0 ? <div className="source-list">{signalSources.map((source) => <article className="source-row" key={source.id}><div><strong>{source.name ?? "Perfil sem nome"}</strong><span>{displayLinkedInUrl(source.linkedinUrl)}</span></div><div className="source-metrics"><span>{source.posts} posts</span><span>{source.comments} comentários</span><span>{source.ratio.toFixed(2)} razão</span></div><span className={`curation-status source-${source.status}`}>{source.status}</span><div className="source-actions">{source.status !== "monitorada" && <Button type="button" size="sm" onClick={() => void handleSourceStatus(source.id, "monitorada")}>Monitorar</Button>}{source.status !== "descartada" && <Button type="button" size="sm" variant="outline" onClick={() => void handleSourceStatus(source.id, "descartada")}>Descartar</Button>}</div></article>)}</div> : <div className="filtered-empty"><strong>Nenhuma fonte descoberta</strong><span>Use “Descobrir fontes” para encontrar perfis brasileiros candidatos.</span></div>}</section>}
          </div> : activeView === "comments" && session && signalComments.length > 0 ? <section className="signal-panel">
            <div className="comment-toolbar">
              <div className="comment-filters" role="group" aria-label="Filtrar comentários">
                {([["all", "Todos"], ["pain", "Dores"], ["question", "Perguntas"], ["experience", "Experiências"], ["generic", "Genéricos"]] as Array<[CommentFilter, string]>).map(([filter, label]) => <Button key={filter} type="button" size="sm" variant={commentFilter === filter ? "default" : "outline"} onClick={() => setCommentFilter(filter)}>{label}</Button>)}
              </div>
              <Input value={commentSearch} onChange={(event) => setCommentSearch(event.target.value)} placeholder="Buscar pessoa ou comentário" aria-label="Buscar comentários" />
            </div>
            <div className="panel-heading"><div><p className="eyebrow">Comentários</p><h2>{visibleComments().length} comentários encontrados</h2><p>Classificação automática com evidência preservada.</p></div><div className="panel-heading-actions"><span className="signal-tag">Dados reais</span><Button type="button" size="sm" variant="outline" disabled={classificationBusy} onClick={handleClassifyComments}>{classificationBusy ? "Classificando…" : "Classificar pendentes"}</Button><Button type="button" size="sm" variant="outline" onClick={exportComments}>Baixar CSV</Button></div></div>
            {visibleComments().length > 0 ? <div className="table-wrap"><table><thead><tr><th>Pessoa</th><th>Empresa</th><th>Teor</th><th>Comentário</th><th>Post</th></tr></thead><tbody>{visibleComments().map((comment) => <tr key={comment.id}><td><strong>{comment.personName}</strong><small>{comment.personHeadline ?? "Perfil público"}</small><a href={comment.personUrl} target="_blank" rel="noreferrer">Ver perfil</a></td><td><strong>{comment.companyName ?? "Empresa não identificada"}</strong><small>{formatDate(comment.publishedAt)}</small></td><td><span className="signal-tag">{commentToneLabel(comment.tone)}</span>{comment.confidence !== null && comment.confidence < 0.6 && <span className="review-tag">Revisar</span>}</td><td className="table-comment">“{comment.text}”</td><td><a href={comment.postUrl} target="_blank" rel="noreferrer">Ver post</a></td></tr>)}</tbody></table></div> : <div className="filtered-empty"><strong>Nenhum comentário encontrado</strong><span>Remova um filtro ou altere a busca.</span></div>}
          </section> : activeView === "companies" && session && signalSummary?.projectId && selectedCompany ? <div className="company-layout">
            <section className="signal-panel company-results-panel"><div className="panel-heading"><div><h2>Empresas identificadas</h2><p>Ordenadas pela participação observada.</p></div><span className="signal-tag">{signalCompanies.length} contas</span></div><div className="company-list">{signalCompanies.map((company) => <button className={`company-card ${selectedCompany.id === company.id ? "is-selected" : ""}`} type="button" key={company.id} onClick={() => setSelectedCompanyId(company.id)}><div className="company-avatar"><Building2 size={17} /></div><div className="company-info"><strong>{company.name}</strong><span>{company.people} pessoa{company.people === 1 ? "" : "s"} observada{company.people === 1 ? "" : "s"}</span></div><div className="company-metric"><strong>{company.comments}</strong><span>comentários</span></div></button>)}</div></section>
            <section className="signal-panel company-detail-panel"><div className="company-heading"><div><h2>{selectedCompany.name}</h2><p>{selectedCompany.sector ?? "Setor não informado"}{selectedCompany.size ? ` · ${selectedCompany.size}` : ""}<br />A conta apareceu a partir de pessoas que comentaram posts monitorados.</p></div>{selectedCompany.linkedinUrl && <a href={selectedCompany.linkedinUrl} target="_blank" rel="noreferrer">Ver empresa</a>}</div><div className="summary-strip"><div><strong>{selectedCompany.people}</strong><span>pessoas com sinal observado</span></div><div><strong>{selectedCompany.comments}</strong><span>comentários coletados</span></div><div><strong>{signalPeople.filter((person) => person.companyName === selectedCompany.name && person.icp === true).length}</strong><span>dentro do ICP</span></div></div><section className="people-section"><div className="section-heading"><div><h3>Pessoas observadas</h3><p>Entraram porque comentaram posts monitorados.</p></div><span className="signal-tag">Sinal comprovado</span></div>{signalPeople.filter((person) => person.companyName === selectedCompany.name).length > 0 ? signalPeople.filter((person) => person.companyName === selectedCompany.name).map((person) => <div className="person-row" key={person.id}><div className="comment-avatar">{person.name.slice(0, 1).toUpperCase()}</div><div className="person-info"><strong>{person.name}</strong><span>{person.headline ?? person.role ?? "Perfil público"}</span></div><div className="person-signal"><strong>{person.comments} comentário{person.comments === 1 ? "" : "s"}</strong><span>{person.icp === true ? "Dentro do ICP" : "ICP pendente ou fora"}</span></div></div>) : <div className="filtered-empty"><strong>Nenhuma pessoa disponível</strong><span>Os perfis aparecerão após uma coleta válida de comentários.</span></div>}</section></section>
          </div> : activeView === "people" && session && signalSummary?.projectId && signalPeople.length > 0 ? <section className="signal-panel analysis-panel">
            <div className="comment-toolbar"><div className="comment-filters" role="group" aria-label="Filtrar pessoas"><Button type="button" size="sm" variant={peopleFilter === "all" ? "default" : "outline"} onClick={() => setPeopleFilter("all")}>Todas</Button><Button type="button" size="sm" variant={peopleFilter === "icp" ? "default" : "outline"} onClick={() => setPeopleFilter("icp")}>Dentro do ICP</Button><Button type="button" size="sm" variant={peopleFilter === "without-icp" ? "default" : "outline"} onClick={() => setPeopleFilter("without-icp")}>Fora ou pendentes</Button></div></div>
            <div className="panel-heading"><div><p className="eyebrow">Pessoas</p><h2>{visiblePeople().length} pessoas observadas</h2><p>Pessoas que demonstraram um sinal público em comentários coletados.</p></div><span className="signal-tag">Dados reais</span></div>
            <div className="table-wrap"><table><thead><tr><th>Pessoa</th><th>Empresa</th><th>Origem</th><th>Atividade pública</th><th /></tr></thead><tbody>{visiblePeople().map((person) => <tr key={person.id}><td><strong>{person.name}</strong><small>{person.headline ?? person.role ?? "Perfil público"}</small><a href={person.linkedinUrl} target="_blank" rel="noreferrer">Ver perfil</a></td><td>{person.companyName ?? "Empresa não identificada"}</td><td><span className={`signal-tag ${person.icp === true ? "" : "signal-tag-muted"}`}>{person.icp === true ? "Dentro do ICP" : person.icp === false ? "Fora do ICP" : "ICP pendente"}</span></td><td><strong>{person.comments}</strong> <small>comentário{person.comments === 1 ? "" : "s"}</small></td><td><Button type="button" size="xs" variant="outline" onClick={() => openPersonReview(person)}>Revisar</Button></td></tr>)}</tbody></table></div>
          </section> : activeView === "overview" && session && signalSummary?.projectId ? null : summaryLoading ? <div className="empty-state" aria-busy="true">
            <div className="empty-icon"><Clock3 size={24} /></div>
            <h2>Carregando dados reais</h2>
            <p>Buscando a pesquisa, o histórico e os sinais já persistidos.</p>
          </div> : <div className="empty-state">
            <div className="empty-icon"><BarChart3 size={24} /></div>
            <h2>{session && signalSummary?.posts ? "Sinais reais disponíveis" : content.title}</h2>
            <p>{session && signalSummary?.posts ? "Os resultados persistidos no Supabase aparecerão nas áreas de Posts, Comments, Companies e People." : content.description}</p>
            {activeView === "overview" && (
              <Button className="empty-action" onClick={() => setSettingsOpen(true)}>
                <Settings2 size={16} /> Configurar primeira pesquisa
              </Button>
            )}
          </div>}
        </section>
      </main>

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSettingsOpen(false)}>
          <section aria-labelledby="settings-title" aria-modal="true" className="settings-modal" role="dialog">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Configuração</p>
                <h2 id="settings-title">Nova pesquisa temática</h2>
              </div>
              <button aria-label="Fechar configuração" className="icon-button" onClick={() => setSettingsOpen(false)} type="button"><X size={18} /></button>
            </div>
            <p className="modal-description">Esses parâmetros serão usados na próxima coleta real do Apify.</p>
            <form onSubmit={handleSaveSettings}>
              <label htmlFor="keyword">Palavra-chave principal</label>
              <input id="keyword" onChange={(event) => setKeyword(event.target.value)} placeholder="Ex.: cost breakdown" value={keyword} />
              <label htmlFor="positive-context">Contextos incluídos <span>opcional</span></label>
              <textarea id="positive-context" onChange={(event) => setPositiveContext(event.target.value)} placeholder="procurement, sourcing, spend visibility" value={positiveContext} />
              <label htmlFor="negative-context">Contextos excluídos <span>opcional</span></label>
              <textarea id="negative-context" onChange={(event) => setNegativeContext(event.target.value)} placeholder="consumer spending, publicidade" value={negativeContext} />
              <div className="modal-actions">
                <Button onClick={() => setSettingsOpen(false)} type="button" variant="ghost">Cancelar</Button>
                <Button disabled={!keyword.trim()} type="submit">Salvar configuração</Button>
              </div>
            </form>
          </section>
        </div>
      )}

      {authOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setAuthOpen(false)}>
          <section aria-labelledby="auth-title" aria-modal="true" className="settings-modal auth-modal" role="dialog">
            <div className="modal-header"><div><p className="eyebrow">Acesso seguro</p><h2 id="auth-title">{authMode === "signin" ? "Entrar no Signal Lab" : authMode === "signup" ? "Criar sua conta" : authMode === "recovery" ? "Recuperar senha" : "Atualizar senha"}</h2></div><button aria-label="Fechar acesso" className="icon-button" onClick={() => setAuthOpen(false)} type="button"><X size={18} /></button></div>
            <p className="modal-description">{authMode === "recovery" ? "Informe seu e-mail e enviaremos um link seguro para redefinir sua senha." : authMode === "update-password" ? "Escolha uma nova senha para voltar a acessar suas análises." : "A coleta é vinculada ao seu usuário e permanece separada de outras contas."}</p>
            <form onSubmit={handleAuth}>
              {authMode !== "update-password" && <><label htmlFor="auth-email">E-mail</label><input autoComplete="email" id="auth-email" onChange={(event) => setAuthEmail(event.target.value)} required type="email" value={authEmail} /></>}
              {authMode !== "recovery" && <><label htmlFor="auth-password">{authMode === "update-password" ? "Nova senha" : "Senha"}</label><div className="password-field"><input autoComplete={authMode === "signin" ? "current-password" : "new-password"} id="auth-password" minLength={6} onChange={(event) => setAuthPassword(event.target.value)} required type={authPasswordVisible ? "text" : "password"} value={authPassword} /><button aria-label={authPasswordVisible ? "Ocultar senha" : "Mostrar senha"} className="password-toggle" onClick={() => setAuthPasswordVisible((visible) => !visible)} type="button">{authPasswordVisible ? "Ocultar" : "Mostrar"}</button></div></>}
              {authError && <p className="auth-error" role="alert">{authError}</p>}
              <div className="modal-actions">{authMode !== "update-password" && <Button onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setAuthError("") }} type="button" variant="ghost">{authMode === "signin" ? "Criar conta" : "Já tenho conta"}</Button>}{authMode === "signin" && <Button onClick={() => { setAuthMode("recovery"); setAuthError("") }} type="button" variant="ghost">Esqueci a senha</Button>}<Button disabled={authBusy} type="submit">{authBusy ? "Aguarde…" : authMode === "signin" ? "Entrar" : authMode === "signup" ? "Criar conta" : authMode === "recovery" ? "Enviar link" : "Atualizar senha"}</Button></div>
            </form>
          </section>
        </div>
      )}

      {personUnderReview && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPersonUnderReview(null)}>
          <section aria-labelledby="person-review-title" aria-modal="true" className="settings-modal person-review-modal" role="dialog">
            <div className="modal-header"><div><p className="eyebrow">Revisão humana</p><h2 id="person-review-title">{personUnderReview.name}</h2></div><button aria-label="Fechar revisão" className="icon-button" onClick={() => setPersonUnderReview(null)} type="button"><X size={18} /></button></div>
            <p className="modal-description">Esses campos passam a ser protegidos contra a classificação automática.</p>
            <form onSubmit={handlePersonReview}>
              <label htmlFor="person-role">Cargo</label>
              <input id="person-role" value={reviewRole} onChange={(event) => setReviewRole(event.target.value)} placeholder="Ex.: Gerente de Compras" />
              <label htmlFor="person-seniority">Senioridade</label>
              <select id="person-seniority" value={reviewSeniority} onChange={(event) => setReviewSeniority(event.target.value as PersonSeniority)}>{seniorityOptions.map((option) => <option key={option} value={option}>{option === "diretoria" ? "Diretoria" : option === "gerencia" ? "Gerência" : option === "analista" ? "Analista" : "Fora do ICP"}</option>)}</select>
              <label className="review-checkbox" htmlFor="person-icp"><span>Dentro do ICP</span><input id="person-icp" checked={reviewIcp} onChange={(event) => setReviewIcp(event.target.checked)} type="checkbox" /></label>
              <div className="modal-actions"><Button onClick={() => setPersonUnderReview(null)} type="button" variant="ghost">Cancelar</Button><Button disabled={reviewBusy} type="submit">{reviewBusy ? "Salvando…" : "Salvar revisão"}</Button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
