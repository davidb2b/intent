import { useCallback, useEffect, useState } from "react"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { authService } from "@/features/auth/services/auth-service"
import { productErrorMessage } from "@/lib/product-messages"
import type { IcpRecord, OnboardingExecution, OnboardingWorkspace } from "./domain/onboarding"
import { activateIcp, generateIcp, loadOnboardingExecution, loadOnboardingWorkspace, saveIcp } from "./services/onboarding-service"
import { IcpEditor } from "./components/IcpEditor"
import { OnboardingProgress } from "./components/OnboardingProgress"
import { OnboardingStart } from "./components/OnboardingStart"
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
    void refresh().catch((caught) => { if (active) setError(productErrorMessage(caught, "Não conseguimos preparar sua conta agora. Tente novamente em alguns instantes.")) })
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
    const domain = new URL(siteUrl).hostname.replace(/^www\./, "")
    setWorkspace((current) => current ? { ...current, project: { ...current.project, siteUrl, domain } } : current)
    setExecution({ id: "pending", status: "rodando", stage: "site", progress: 2, message: "Reunindo as primeiras informações públicas.", error: null, costUsd: 0 })
    try {
      await generateIcp(workspace.project.id, siteUrl, regenerate)
      await refresh()
    } catch (caught) {
      setError(productErrorMessage(caught, "Não conseguimos concluir a análise agora. Seus dados estão seguros; tente novamente em alguns instantes."))
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

  if (!workspace && !error) return <div aria-live="polite" className="intent-fullscreen-loading"><Spinner label="Preparando sua experiência" /><span>Preparando sua experiência…</span></div>

  const editorVisible = Boolean(workspace?.latestIcp && !isRunning)
  const body = workspace && isRunning ? <OnboardingProgress domain={workspace.project.domain ?? new URL(workspace.project.siteUrl ?? "https://intent.local").hostname} execution={execution} />
    : workspace?.latestIcp ? <IcpEditor busy={busy === "starting" ? null : busy} initialIcp={workspace.latestIcp} onActivate={activate} onRegenerate={regenerate} onSave={save} warning={workspace.project.onboardingWarning} />
    : workspace ? <OnboardingStart busy={busy === "starting"} initialUrl={workspace.project.siteUrl} onStart={(siteUrl) => start(siteUrl)} />
    : <main className="intent-onboarding-main"><div className="intent-pipeline-error"><strong>Não conseguimos preparar sua conta</strong><p>{error}</p></div></main>

  return <div className="intent-onboarding-shell">
    {!editorVisible && <header className="intent-lite-topbar"><a className="intent-brand" href="/overview"><span>In</span>Intent</a><div><span>{session.email}</span><Button onClick={() => void authService.signOut()} size="sm" variant="ghost"><LogOut size={14} />Sair</Button></div></header>}
    {error && !isRunning && <div className="intent-global-error" role="alert">{error}</div>}
    {body}
  </div>
}
