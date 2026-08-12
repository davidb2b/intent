import { useEffect, useState } from "react"
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
import { supabase } from "@/infrastructure/supabase/client"
import "./App.css"

type View = "overview" | "posts" | "comments" | "companies" | "people"
type CollectionState = "idle" | "running" | "success" | "error"
type AuthMode = "signin" | "signup"

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
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>("signin")
  const [authEmail, setAuthEmail] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState("")

  const content = viewCopy[activeView]

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSessionEmail(data.session?.user.email ?? null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setSessionEmail(session?.user.email ?? null))
    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleCollect() {
    if (!keyword.trim() || !sessionEmail || collectionState === "running") {
      if (!sessionEmail) { setAuthOpen(true); setCollectionMessage("Faça login para iniciar uma coleta real.") }
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

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthBusy(true)
    setAuthError("")
    const result = authMode === "signin"
      ? await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
      : await supabase.auth.signUp({ email: authEmail, password: authPassword })
    setAuthBusy(false)
    if (result.error) { setAuthError(result.error.message); return }
    setAuthOpen(false)
    setCollectionMessage(authMode === "signup" ? "Conta criada. Verifique seu e-mail se a confirmação estiver habilitada." : "Login realizado.")
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
              onClick={() => setActiveView(id)}
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
            {sessionEmail ? <span className="session-label">{sessionEmail}</span> : <Button onClick={() => setAuthOpen(true)} variant="outline">Entrar</Button>}
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
          <Button className="collect-button" disabled={!keyword.trim() || !sessionEmail || collectionState === "running"} onClick={handleCollect}>
            <Play size={14} /> {collectionState === "running" ? "Coletando…" : "Atualizar agora"}
          </Button>
        </section>

        {collectionMessage && <p aria-live="polite" className={`collection-message collection-message-${collectionState}`}>{collectionMessage}</p>}

        <section className="content-area">
          <div className="empty-state">
            <div className="empty-icon"><BarChart3 size={24} /></div>
            <h2>{content.title}</h2>
            <p>{content.description}</p>
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
            <div className="modal-header"><div><p className="eyebrow">Acesso seguro</p><h2 id="auth-title">{authMode === "signin" ? "Entrar no Signal Lab" : "Criar sua conta"}</h2></div><button aria-label="Fechar acesso" className="icon-button" onClick={() => setAuthOpen(false)} type="button"><X size={18} /></button></div>
            <p className="modal-description">A coleta é vinculada ao seu usuário e permanece separada de outras contas.</p>
            <form onSubmit={handleAuth}>
              <label htmlFor="auth-email">E-mail</label><input autoComplete="email" id="auth-email" onChange={(event) => setAuthEmail(event.target.value)} required type="email" value={authEmail} />
              <label htmlFor="auth-password">Senha</label><input autoComplete={authMode === "signin" ? "current-password" : "new-password"} id="auth-password" minLength={6} onChange={(event) => setAuthPassword(event.target.value)} required type="password" value={authPassword} />
              {authError && <p className="auth-error" role="alert">{authError}</p>}
              <div className="modal-actions"><Button onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setAuthError("") }} type="button" variant="ghost">{authMode === "signin" ? "Criar conta" : "Já tenho conta"}</Button><Button disabled={authBusy} type="submit">{authBusy ? "Aguarde…" : authMode === "signin" ? "Entrar" : "Criar conta"}</Button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
