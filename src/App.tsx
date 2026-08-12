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
import { startCollection } from "@/application/collection/start-collection"
import { loadSignalSummary, type SignalSummary } from "@/application/signals/load-signals"
import { supabase } from "@/infrastructure/supabase/client"
import "./App.css"

type View = "overview" | "posts" | "comments" | "companies" | "people"
type CollectionState = "idle" | "running" | "success" | "error"
type AuthMode = "signin" | "signup" | "recovery" | "update-password"
type AuthSession = { email: string; userId: string }

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

const navigation: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "posts", label: "Posts", icon: FileText },
  { id: "comments", label: "Comments", icon: MessageCircle },
  { id: "companies", label: "Companies", icon: Building2 },
  { id: "people", label: "People", icon: Users },
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
  const [summaryError, setSummaryError] = useState("")

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
      setSummaryError("")
      return
    }
    let active = true
    setSummaryError("")
    void loadSignalSummary(session.userId)
      .then((summary) => { if (active) setSignalSummary(summary) })
      .catch((error) => { if (active) setSummaryError(error instanceof Error ? error.message : "Não foi possível ler os sinais.") })
    return () => { active = false }
  }, [session])

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
      const result = await startCollection({ keyword, positiveContext, negativeContext })
      setCollectionState("success")
      setCollectionCost(result.costUsd > 0 ? `$${result.costUsd.toFixed(3)}` : "$0.000")
      setCollectionMessage(`${result.postsRead} posts e ${result.commentsRead} comentários persistidos.`)
    } catch (error) {
      setCollectionState("error")
      setCollectionMessage(error instanceof Error ? error.message : "Não foi possível executar a coleta.")
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

  async function handleLogout() {
    const { error } = await supabase.auth.signOut()
    if (error) setCollectionMessage(error.message)
    else setCollectionMessage("Sessão encerrada.")
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
          <Button className="collect-button" disabled={!keyword.trim() || !session || collectionState === "running"} onClick={handleCollect}>
            <Play size={14} /> {collectionState === "running" ? "Coletando…" : "Atualizar agora"}
          </Button>
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
          <div className="empty-state">
            <div className="empty-icon"><BarChart3 size={24} /></div>
            <h2>{session && signalSummary?.posts ? "Sinais reais disponíveis" : content.title}</h2>
            <p>{session && signalSummary?.posts ? "Os resultados persistidos no Supabase aparecerão nas áreas de Posts, Comments, Companies e People." : content.description}</p>
            {activeView === "overview" && (
              <Button className="empty-action" onClick={() => setSettingsOpen(true)}>
                <Settings2 size={16} /> Configurar primeira pesquisa
              </Button>
            )}
          </div>
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
            <form onSubmit={(event) => { event.preventDefault(); setSettingsOpen(false) }}>
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
