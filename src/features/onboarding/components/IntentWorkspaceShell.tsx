import { ChevronRight, LogOut } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { IntentV1Sidebar, type IntentSidebarView } from "@/features/intent/components/IntentV1Sidebar"
import type { IntentProject } from "../domain/onboarding"
import "@/features/intent/components/intent-v1-workspace.css"

type Props = { project: IntentProject; version: number; active: boolean; email?: string; onSignOut?: () => void; children: ReactNode }

const destinations: Record<Exclude<IntentSidebarView, "icp">, string> = { inicio: "/overview", pessoas: "/people", contas: "/companies", watchlist: "/watchlist", sim: "/classification" }

export function IntentWorkspaceShell({ project, version, active, email, onSignOut, children }: Props) {
  const navigate = (view: IntentSidebarView) => { if (view !== "icp") window.location.assign(destinations[view]) }
  return <div className="intent-v1-shell">
    <IntentV1Sidebar active={active} activeView="icp" onNavigate={navigate} project={project} version={version} />
    <main className="intent-v1-main intent-onboarding-v1-main">
      {email && <header className="intent-v1-header"><div><p>Intent <ChevronRight size={13} /> Perfil ideal</p></div><div><span className="intent-v1-email">{email}</span>{onSignOut && <Button onClick={onSignOut} size="sm" variant="outline"><LogOut size={15} />Sair</Button>}</div></header>}
      {children}
    </main>
  </div>
}
