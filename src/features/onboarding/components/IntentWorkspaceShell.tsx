import { Target } from "lucide-react"
import type { ReactNode } from "react"
import type { IntentProject } from "../domain/onboarding"

export function IntentWorkspaceShell({ project, version, active, children }: { project: IntentProject; version: number; active: boolean; children: ReactNode }) {
  const initials = project.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "IN"
  const creditsUsed = version > 0 ? 12 : 0
  return <div className="intent-workspace-shell">
    <aside className="intent-workspace-sidebar">
      <a className="intent-sidebar-brand" href="/overview"><span>In</span>Intent</a>
      <div className="intent-workspace-identity"><span>{initials}</span><div><strong>{project.name}</strong><small>{project.domain ?? "Sua empresa"}</small></div></div>
      <p className="intent-sidebar-section">Configuração</p>
      <nav><button className="is-active" type="button"><Target size={15} />Perfil ideal<small>v{version}</small></button></nav>
      <footer><div><span>Créditos do plano</span><strong>{creditsUsed.toLocaleString("pt-BR")} / {project.monthlyCredits.toLocaleString("pt-BR")} usados</strong><i><b style={{ width: `${Math.min(100, (creditsUsed / Math.max(project.monthlyCredits, 1)) * 100)}%` }} /></i></div><p className={active ? "is-active" : ""}><span />Perfil ideal {active ? `v${version} ativo` : "em revisão"}</p></footer>
    </aside>
    <div className="intent-workspace-content">{children}</div>
  </div>
}
