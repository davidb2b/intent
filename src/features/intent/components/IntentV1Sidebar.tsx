import { Building2, Eye, FlaskConical, Home, Target, Users } from "lucide-react"
import type { OnboardingWorkspace } from "@/features/onboarding/domain/onboarding"

export type IntentSidebarView = "inicio" | "pessoas" | "contas" | "watchlist" | "icp" | "sim"

type Props = {
  project: OnboardingWorkspace["project"]
  activeView: IntentSidebarView
  peopleCount?: number
  companiesCount?: number
  watchlistCount?: number
  version: number
  active: boolean
  creditsUsed?: number
  onNavigate: (view: IntentSidebarView) => void
}

const primaryItems: Array<{ id: Exclude<IntentSidebarView, "icp" | "sim">; label: string; icon: typeof Home }> = [
  { id: "inicio", label: "Início", icon: Home },
  { id: "pessoas", label: "Pessoas", icon: Users },
  { id: "contas", label: "Contas", icon: Building2 },
  { id: "watchlist", label: "Watchlist", icon: Eye },
]

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "IN"
}

export function IntentV1Sidebar({ project, activeView, peopleCount = 0, companiesCount = 0, watchlistCount = 0, version, active, creditsUsed = 0, onNavigate }: Props) {
  const creditLimit = project.monthlyCredits
  return <aside className="intent-v1-sidebar">
    <button className="intent-v1-brand" onClick={() => onNavigate("inicio")} type="button"><span>In</span>Intent</button>
    <div className="intent-v1-company"><span>{initials(project.name)}</span><div><strong>{project.name}</strong><small>{project.domain ?? "Seu workspace"}</small></div></div>
    <p>Workspace</p>
    <nav aria-label="Navegação principal">{primaryItems.map(({ id, label, icon: Icon }) => <button className={activeView === id ? "is-active" : ""} key={id} onClick={() => onNavigate(id)} type="button"><Icon size={16} /><span>{label}</span>{id === "pessoas" && peopleCount > 0 ? <small>{peopleCount}</small> : id === "contas" && companiesCount > 0 ? <small>{companiesCount}</small> : id === "watchlist" && watchlistCount > 0 ? <small>{watchlistCount}</small> : null}</button>)}</nav>
    <p>Configuração</p>
    <nav aria-label="Configuração"><button aria-label="Perfil ideal" className={activeView === "icp" ? "is-active" : ""} onClick={() => onNavigate("icp")} type="button"><Target size={16} /><span>ICP</span><small>v{version}</small></button><button className={activeView === "sim" ? "is-active" : ""} onClick={() => onNavigate("sim")} type="button"><FlaskConical size={16} /><span>Testar classificação</span></button></nav>
    <footer><div className="intent-v1-credit"><span>Uso do plano</span><strong>{creditsUsed.toLocaleString("pt-BR")} / {creditLimit.toLocaleString("pt-BR")}</strong><i><b style={{ width: `${creditLimit > 0 ? Math.min(100, Math.round((creditsUsed / creditLimit) * 100)) : 0}%` }} /></i><small>{creditLimit > 0 ? "créditos usados neste ciclo" : "Plano em configuração"}</small></div><div className="intent-v1-ready"><b />Dados protegidos</div><span className={`intent-v1-status ${active ? "is-active" : ""}`}>{active ? `ICP v${version} ativo` : "ICP em revisão"}</span></footer>
  </aside>
}
