import { useCallback, useEffect, useState } from "react"
import { LoaderCircle, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { authService } from "@/features/auth/services/auth-service"
import type { IcpRecord, OnboardingExecution, OnboardingWorkspace } from "./domain/onboarding"
import { activateIcp, generateIcp, loadOnboardingExecution, loadOnboardingWorkspace, saveIcp } from "./services/onboarding-service"
import { IcpEditor } from "./components/IcpEditor"
import { OnboardingProgress } from "./components/OnboardingProgress"
import { OnboardingStart } from "./components/OnboardingStart"
import { IntentWorkspaceShell } from "./components/IntentWorkspaceShell"
import "./onboarding.css"

type Session = { email: string; userId: string }
type Busy = "starting" | "saving" | "activating" | "regenerating" | null

export function OnboardingFlow({ session }: { session: Session }) {
  const [workspace, setWorkspace] = useState<OnboardingWorkspace | null>(null)
  const [execution, setExecution] = useState<OnboardingExecution | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState("")

  const refresh = useCallback(async () => {
    const next = await loadOnboardingWorkspace(session.userId)
    setWorkspace(next)
    setExecution(next.execution)
    return next
  }, [session.userId])

  useEffect(() => {
    let active = true
    void refresh().catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Não foi possível carregar o workspace.") })
    return () => { active = false }
  }, [refresh])

  const isRunning = busy === "starting" || busy === "regenerating" || execution?.status === "rodando"
  useEffect(() => {
    if (!workspace?.project.id || !isRunning) return
    let active = true
    const poll = async () => {
      try {
        const next = await loadOnboardingExecution(workspace.project.id)
        if (active && next) {
          setExecution(next)
          if (next.status !== "rodando") await refresh()
        }
      } catch { /* The invoking request owns the final error state. */ }
    }
    void poll()
    const timer = window.setInterval(poll, 1_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [isRunning, refresh, workspace?.project.id])

  const start = async (siteUrl: string, regenerate = false) => {
    if (!workspace) return
    setError("")
    setBusy(regenerate ? "regenerating" : "starting")
    setExecution({ id: "pending", status: "rodando", stage: "site", progress: 2, message: "Preparando a análise das fontes públicas.", error: null, costUsd: 0 })
    try {
      await generateIcp(workspace.project.id, siteUrl, regenerate)
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível concluir a análise.")
      const latest = await loadOnboardingExecution(workspace.project.id).catch(() => null)
      if (latest) setExecution(latest)
      throw caught
    } finally {
      setBusy(null)
    }
  }

  const save = async (icp: IcpRecord) => { setBusy("saving"); try { await saveIcp(icp); await refresh() } finally { setBusy(null) } }
  const activate = async (icp: IcpRecord) => { setBusy("activating"); try { await activateIcp(icp.id); await refresh(); window.history.pushState({}, "", "/icp") } finally { setBusy(null) } }
  const regenerate = async () => { if (workspace?.project.siteUrl) await start(workspace.project.siteUrl, true) }

  if (!workspace && !error) return <div className="intent-fullscreen-loading"><LoaderCircle className="intent-spin" size={22} /><span>Carregando workspace…</span></div>

  const editorVisible = Boolean(workspace?.latestIcp && !isRunning)
  const body = workspace && isRunning ? <OnboardingProgress domain={workspace.project.domain ?? new URL(workspace.project.siteUrl ?? "https://intent.local").hostname} execution={execution} />
    : workspace?.latestIcp ? <IcpEditor busy={busy === "starting" ? null : busy} initialIcp={workspace.latestIcp} onActivate={activate} onRegenerate={regenerate} onSave={save} warning={workspace.project.onboardingWarning} />
    : workspace ? <OnboardingStart busy={busy === "starting"} initialUrl={workspace.project.siteUrl} onStart={(siteUrl) => start(siteUrl)} />
    : <main className="intent-onboarding-main"><div className="intent-pipeline-error"><strong>Não foi possível abrir o onboarding.</strong><p>{error}</p></div></main>

  return <div className="intent-onboarding-shell">
    {!editorVisible && <header className="intent-lite-topbar"><a className="intent-brand" href="/overview"><span>In</span>Intent</a><div><span>{session.email}</span><Button onClick={() => void authService.signOut()} size="sm" variant="ghost"><LogOut size={14} />Sair</Button></div></header>}
    {error && !isRunning && <div className="intent-global-error" role="alert">{error}</div>}
    {editorVisible && workspace?.latestIcp ? <IntentWorkspaceShell active={workspace.latestIcp.status === "ativo"} project={workspace.project} version={workspace.latestIcp.version}>{body}</IntentWorkspaceShell> : body}
  </div>
}
