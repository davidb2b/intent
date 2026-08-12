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
import { discoverSources } from "@/application/collection/discover-sources"
import { runMonitoring } from "@/application/collection/run-monitoring"
import { classifyComments } from "@/application/classification/classify-comments"
import { analyzePosts } from "@/application/classification/analyze-posts"
import { updatePostCuration, type CurationStatus } from "@/application/curation/update-post-curation"
import { loadSignalComments, loadSignalPosts, loadSignalSources, loadSignalSummary, type SignalComment, type SignalPost, type SignalSource, type SignalSummary } from "@/application/signals/load-signals"
import { updateSourceStatus } from "@/application/sources/update-source-status"
import { supabase } from "@/infrastructure/supabase/client"
import "./App.css"

type View = "overview" | "posts" | "comments" | "companies" | "people"
type CollectionState = "idle" | "running" | "success" | "error"
type AuthMode = "signin" | "signup" | "recovery" | "update-password"
type AuthSession = { email: string; userId: string }
type CommentFilter = "all" | "pain" | "question" | "experience" | "generic"
type PostsMode = "search" | "sources"

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

function shorten(value: string | null, length = 180) {
  if (!value) return "Sem texto disponível."
  return value.length > length ? `${value.slice(0, length).trim()}…` : value
}

const navigation: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "posts", label: "Posts", icon: FileText },
  { id: "comments", label: "Comentários", icon: MessageCircle },
  { id: "companies", label: "Empresas", icon: Building2 },
  { id: "people", label: "Pessoas", icon: Users },
]

const viewCopy: Record<View, { eyebrow: string; title: string; description: string }> = {
  overview: {
    eyebrow: "Visão geral",
    title: "Nenhum sinal coletado ainda",
    description: "Configure uma pesquisa para começar a encontrar conversas públicas sobre um tema.",
  },
  posts: {
    eyebrow: "Posts",
    title: "Nenhum post disponível",
    description: "Os posts encontrados pela coleta aparecerão aqui, sem dados fictícios.",
  },
  comments: {
    eyebrow: "Comentários",
    title: "Nenhum comentário disponível",
    description: "Os comentários coletados e classificados aparecerão aqui.",
  },
  companies: {
    eyebrow: "Empresas",
    title: "Nenhuma empresa identificada",
    description: "As empresas observadas nas conversas aparecerão aqui quando houver uma coleta.",
  },
  people: {
    eyebrow: "Pessoas",
    title: "Nenhuma pessoa identificada",
    description: "As pessoas que demonstram interesse no tema aparecerão aqui.",
  },
}

function App() {
  const [activeView, setActiveView] = useState<View>("overview")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [keyword, setKeyword] = useState("")
  const [positiveContext, setPositiveContext] = useState("")
  const [negativeContext, setNegativeContext] = useState("")
  const [collectionState, setCollectionState] = useState<CollectionState>("idle")
  const [collectionMessage, setCollectionMessage] = useState("")
  const [collectionCost, setCollectionCost] = useState<string>("—")
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
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [postsMode, setPostsMode] = useState<PostsMode>("search")
  const [signalComments, setSignalComments] = useState<SignalComment[]>([])
  const [commentFilter, setCommentFilter] = useState<CommentFilter>("all")
  const [commentSearch, setCommentSearch] = useState("")
  const [summaryError, setSummaryError] = useState("")
  const [classificationBusy, setClassificationBusy] = useState(false)
  const [postAnalysisBusy, setPostAnalysisBusy] = useState(false)

  const content = viewCopy[activeView]

  useEffect(() => {
    const updateSession = (nextSession: { user?: { id: string; email?: string } } | null) => {
      setSession(nextSession?.user?.email ? { email: nextSession.user.email, userId: nextSession.user.id } : null)
    }
    void supabase.auth.getSession().then(({ data }) => updateSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
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
      setSelectedPostId(null)
      setSignalComments([])
      setSummaryError("")
      return
    }
    let active = true
    setSummaryError("")
    void loadSignalSummary(session.userId)
      .then(async (summary) => {
        if (!active) return
        setSignalSummary(summary)
        setKeyword(summary.keyword ?? "")
        setPositiveContext(summary.positiveContext ?? "")
        setNegativeContext(summary.negativeContext ?? "")
        if (summary.projectId) {
          const [posts, comments, sources] = await Promise.all([loadSignalPosts(summary.projectId), loadSignalComments(summary.projectId), loadSignalSources(summary.projectId)])
          if (active) { setSignalPosts(posts); setSignalComments(comments); setSignalSources(sources) }
        }
      })
      .catch((error) => { if (active) setSummaryError(error instanceof Error ? error.message : "Não foi possível ler os sinais.") })
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
      setCollectionCost(result.costUsd > 0 ? `$${result.costUsd.toFixed(3)}` : "$0.000")
      setCollectionMessage(`${result.postsRead} posts e ${result.commentsRead} comentários monitorados.`)
      const refreshedSummary = await loadSignalSummary(session.userId)
      setSignalSummary(refreshedSummary)
      if (refreshedSummary.projectId) {
        const [posts, comments, sources] = await Promise.all([loadSignalPosts(refreshedSummary.projectId), loadSignalComments(refreshedSummary.projectId), loadSignalSources(refreshedSummary.projectId)])
        setSignalPosts(posts)
        setSignalComments(comments)
        setSignalSources(sources)
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
      setCollectionCost(result.costUsd > 0 ? `$${result.costUsd.toFixed(3)}` : "$0.000")
      setCollectionMessage(`${result.candidatesInserted} fontes candidatas encontradas; ${result.candidatesRejected} perfis não brasileiros descartados.`)
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
      ? await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
      : authMode === "signup"
        ? await supabase.auth.signUp({ email: authEmail, password: authPassword })
        : authMode === "recovery"
          ? await supabase.auth.resetPasswordForEmail(authEmail, { redirectTo: `${window.location.origin}/reset-password` })
          : await supabase.auth.updateUser({ password: authPassword })
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
      const { data: project, error: projectError } = await supabase.from("projetos").upsert({ owner_id: session.userId, nome: "Signal Lab", categoria: keyword.trim() }, { onConflict: "owner_id" }).select("id").single()
      if (projectError || !project) throw new Error(projectError?.message ?? "Não foi possível salvar o projeto.")
      const { error: termError } = await supabase.from("termos").upsert({ projeto_id: project.id, termo: keyword.trim(), contexto_positivo: positiveContext.trim() || null, contexto_negativo: negativeContext.trim() || null, ativo: true }, { onConflict: "projeto_id,termo" })
      if (termError) throw new Error(termError.message)
      setSignalSummary((summary) => summary ? { ...summary, projectId: project.id, keyword: keyword.trim(), positiveContext: positiveContext.trim() || null, negativeContext: negativeContext.trim() || null } : { projectId: project.id, posts: 0, comments: 0, people: 0, companies: 0, lastExecutionAt: null, keyword: keyword.trim(), positiveContext: positiveContext.trim() || null, negativeContext: negativeContext.trim() || null })
      setSettingsOpen(false)
      setCollectionState("success")
      setCollectionMessage("Configuração salva. Escolha descobrir fontes ou atualizar o monitoramento.")
    } catch (error) {
      setCollectionState("error")
      setCollectionMessage(error instanceof Error ? error.message : "Não foi possível salvar a configuração.")
    }
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut()
    if (error) setCollectionMessage(error.message)
    else setCollectionMessage("Sessão encerrada.")
  }

  function commentMatchesFilter(comment: SignalComment) {
    if (commentFilter === "all") return true
    const tone = (comment.tone ?? "").toLowerCase()
    return commentFilter === "pain"
      ? tone.includes("pain") || tone.includes("dor")
      : commentFilter === "question"
        ? tone.includes("question") || tone.includes("pergunta")
        : commentFilter === "experience"
          ? tone.includes("experience") || tone.includes("experi")
          : tone.includes("generic") || tone.includes("genér") || tone.includes("gener")
  }

  function visibleComments() {
    const query = commentSearch.trim().toLowerCase()
    return signalComments.filter((comment) => {
      if (!commentMatchesFilter(comment)) return false
      if (!query) return true
      return [comment.personName, comment.personHeadline, comment.text, comment.tone].some((value) => value?.toLowerCase().includes(query))
    })
  }

  const selectedPost = signalPosts.find((post) => post.id === selectedPostId) ?? signalPosts[0]

  function exportComments() {
    const rows = [["Pessoa", "Cargo", "Teor", "Comentário", "Data", "Perfil", "Post"], ...visibleComments().map((comment) => [comment.personName, comment.personHeadline ?? "", comment.tone ?? "", comment.text, formatDate(comment.publishedAt), comment.personUrl, comment.postUrl])]
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
    setCollectionState("running")
    try {
      const result = await classifyComments(signalSummary.projectId)
      const [comments, summary] = await Promise.all([loadSignalComments(signalSummary.projectId), loadSignalSummary(session?.userId ?? "")])
      setSignalComments(comments)
      setSignalSummary(summary)
      setCollectionState("success")
      setCollectionMessage(result.classified ? `${result.classified} comentários classificados. ${result.remaining} pendentes.` : "Nenhum comentário pendente para classificar.")
    } catch (error) {
      setCollectionState("error")
      setCollectionMessage(error instanceof Error ? error.message : "Não foi possível classificar os comentários.")
    } finally {
      setClassificationBusy(false)
    }
  }

  async function handleAnalyzePosts() {
    if (!signalSummary?.projectId || postAnalysisBusy) return
    setPostAnalysisBusy(true)
    setCollectionState("running")
    setCollectionMessage("Analisando posts reais…")
    try {
      const result = await analyzePosts(signalSummary.projectId)
      const posts = await loadSignalPosts(signalSummary.projectId)
      setSignalPosts(posts)
      setCollectionState("success")
      setCollectionMessage(result.analyzed ? "Análise do post concluída." : "Nenhum post pendente para analisar.")
    } catch (error) {
      setCollectionState("error")
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
          <div className="status-line"><span className="status-dot" /> Ambiente preparado</div>
          <button className="help-link" type="button"><CircleHelp size={15} /> Ajuda</button>
        </div>
      </aside>

      <main className="signal-main">
        <header className="topbar">
          <div>
            <p className="breadcrumb">Signal Lab <span>/</span> {content.eyebrow}</p>
            <h1>{content.eyebrow}</h1>
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
          <div className={`collection-status collection-${collectionState}`}><span className="status-dot" /> {collectionState === "running" ? "Coleta em andamento" : collectionState === "success" ? "Coleta concluída" : collectionState === "error" ? "Coleta com erro" : "Coleta não iniciada"}</div>
          <div className="collection-meta"><Clock3 size={15} /> Próxima coleta: não agendada</div>
          <div className="collection-meta"><span className="cost-label">Custo</span> {collectionCost}</div>
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
          {session && signalSummary?.projectId && <div className="signal-metrics" aria-label="Resumo dos sinais coletados">
            <div><span>Posts</span><strong>{signalSummary.posts}</strong></div>
            <div><span>Comentários</span><strong>{signalSummary.comments}</strong></div>
            <div><span>Pessoas</span><strong>{signalSummary.people}</strong></div>
            <div><span>Empresas</span><strong>{signalSummary.companies}</strong></div>
          </div>}
          {activeView === "posts" && session && signalSummary?.projectId ? <div className="signal-panel-grid">
            <section className="signal-panel">
              <div className="mode-switch" role="tablist" aria-label="Modo de posts"><Button type="button" size="sm" variant={postsMode === "search" ? "default" : "outline"} onClick={() => setPostsMode("search")}>Resultados da busca</Button><Button type="button" size="sm" variant={postsMode === "sources" ? "default" : "outline"} onClick={() => setPostsMode("sources")}>Perfis monitorados</Button></div>
              {postsMode === "search" ? <><div className="panel-heading"><div><p className="eyebrow">Resultados da busca</p><h2>{signalPosts.length} posts encontrados</h2><p>Clique em um post para revisar.</p></div><div className="panel-heading-actions"><span className="signal-tag">Dados reais</span><Button type="button" size="sm" variant="outline" disabled={postAnalysisBusy || signalPosts.length === 0} onClick={handleAnalyzePosts}>{postAnalysisBusy ? "Analisando…" : "Analisar pendente"}</Button></div></div>
              <div className="post-review-layout">
                <div className="post-results-list" aria-label="Lista de posts encontrados">
                  {signalPosts.map((post) => <article
                    className={`post-card ${selectedPost?.id === post.id ? "is-selected" : ""}`}
                    key={post.id}
                    aria-selected={selectedPost?.id === post.id}
                    tabIndex={0}
                    onClick={() => setSelectedPostId(post.id)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedPostId(post.id) } }}
                  >
                    <div className="post-card-meta"><span>{post.authorName ?? "Autor não identificado"}</span><span>{formatDate(post.publishedAt)}</span></div>
                    <p>{shorten(post.text, 180)}</p>
                    <div className="post-card-footer"><span>{post.reactions ?? 0} reações</span><span>{post.comments ?? 0} comentários</span><span className={`curation-status curation-${post.curationStatus}`}>{post.curationStatus}</span></div>
                  </article>)}
                </div>
                {selectedPost && <article className="post-detail-panel">
                  <div className="post-detail-header"><div><p className="eyebrow">Post selecionado</p><h3>{selectedPost.authorName ?? "Autor não identificado"}</h3><span>{formatDate(selectedPost.publishedAt)}</span></div><span className={`curation-status curation-${selectedPost.curationStatus}`}>{selectedPost.curationStatus}</span></div>
                  <p className="post-detail-text">{selectedPost.text}</p>
                  <div className="post-detail-metrics"><span>{selectedPost.reactions ?? 0} reações</span><span>{selectedPost.comments ?? 0} comentários</span><span>{selectedPost.shares ?? 0} compartilhamentos</span></div>
                  {selectedPost.analysis.topic ? <div className="post-analysis post-analysis-detail"><div><strong>Tópico</strong><span>{selectedPost.analysis.topic}</span></div><div><strong>Problema</strong><span>{selectedPost.analysis.problem}</span></div><div><strong>Por que o post faz sentido</strong><span>{selectedPost.analysis.reason}</span></div><div><strong>Decisão de coleta</strong><span>{selectedPost.analysis.collection}</span></div></div> : <div className="post-detail-empty">Este post ainda não foi analisado. Use “Analisar pendente” para gerar a classificação.</div>}
                  <div className="post-detail-actions"><Button type="button" size="sm" variant={selectedPost.curationStatus === "aprovado" ? "default" : "outline"} onClick={() => void handleCuration(selectedPost.id, "aprovado")}>Aprovar</Button><Button type="button" size="sm" variant={selectedPost.curationStatus === "descartado" ? "destructive" : "outline"} onClick={() => void handleCuration(selectedPost.id, "descartado")}>Descartar</Button><a href={selectedPost.linkedinUrl} target="_blank" rel="noreferrer">Abrir no LinkedIn</a></div>
                </article>}
              </div></> : <section className="sources-panel"><div className="panel-heading"><div><p className="eyebrow">Perfis monitorados</p><h2>{signalSources.filter((source) => source.status === "monitorada").length} fontes ativas</h2><p>As coletas semanais leem somente fontes aprovadas.</p></div><span className="signal-tag">{signalSources.length} fontes</span></div>{signalSources.length > 0 ? <div className="source-list">{signalSources.map((source) => <article className="source-row" key={source.id}><div><strong>{source.name ?? "Perfil sem nome"}</strong><span>{source.linkedinUrl}</span></div><div className="source-metrics"><span>{source.posts} posts</span><span>{source.comments} comentários</span><span>{source.ratio.toFixed(2)} razão</span></div><span className={`curation-status source-${source.status}`}>{source.status}</span><div className="source-actions">{source.status !== "monitorada" && <Button type="button" size="sm" onClick={() => void handleSourceStatus(source.id, "monitorada")}>Monitorar</Button>}{source.status !== "descartada" && <Button type="button" size="sm" variant="outline" onClick={() => void handleSourceStatus(source.id, "descartada")}>Descartar</Button>}</div></article>)}</div> : <div className="filtered-empty"><strong>Nenhuma fonte descoberta</strong><span>Use “Descobrir fontes” para encontrar perfis brasileiros candidatos.</span></div>}</section>}
            </section>
          </div> : activeView === "comments" && session && signalComments.length > 0 ? <section className="signal-panel">
            <div className="comment-toolbar">
              <div className="comment-filters" role="group" aria-label="Filtrar comentários">
                {([["all", "Todos"], ["pain", "Dores"], ["question", "Perguntas"], ["experience", "Experiências"], ["generic", "Genéricos"]] as Array<[CommentFilter, string]>).map(([filter, label]) => <Button key={filter} type="button" size="sm" variant={commentFilter === filter ? "default" : "outline"} onClick={() => setCommentFilter(filter)}>{label}</Button>)}
              </div>
              <Input value={commentSearch} onChange={(event) => setCommentSearch(event.target.value)} placeholder="Buscar pessoa ou comentário" aria-label="Buscar comentários" />
            </div>
            <div className="panel-heading"><div><p className="eyebrow">Comentários</p><h2>{visibleComments().length} comentários encontrados</h2><p>Classificação automática com evidência preservada.</p></div><div className="panel-heading-actions"><span className="signal-tag">Dados reais</span><Button type="button" size="sm" variant="outline" disabled={classificationBusy} onClick={handleClassifyComments}>{classificationBusy ? "Classificando…" : "Classificar pendentes"}</Button><Button type="button" size="sm" variant="outline" onClick={exportComments}>Baixar CSV</Button></div></div>
            {visibleComments().length > 0 ? <div className="comments-list">{visibleComments().map((comment) => <article className="comment-card" key={comment.id}>
              <div className="comment-avatar">{comment.personName.slice(0, 1).toUpperCase()}</div>
              <div><div className="comment-card-heading"><div><strong>{comment.personName}</strong><span>{comment.personHeadline ?? "Perfil público"}</span></div><div className="comment-labels">{comment.tone && <span className="signal-tag">{comment.tone}</span>}{comment.confidence !== null && comment.confidence < 0.6 && <span className="review-tag">Revisar</span>}</div></div><p>“{comment.text}”</p><div className="comment-card-footer"><span>{formatDate(comment.publishedAt)}</span><a href={comment.personUrl} target="_blank" rel="noreferrer">Ver perfil</a><a href={comment.postUrl} target="_blank" rel="noreferrer">Ver post</a></div></div>
            </article>)}</div> : <div className="filtered-empty"><strong>Nenhum comentário encontrado</strong><span>Remova um filtro ou altere a busca.</span></div>}
          </section> : <div className="empty-state">
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
    </div>
  )
}

export default App
