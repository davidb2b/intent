import { Check, LoaderCircle, TriangleAlert } from "lucide-react"
import { ONBOARDING_STAGES, stagePosition, type OnboardingExecution } from "../domain/onboarding"

const icons = ["🌐", "🔎", "💼", "🧠"]

export function OnboardingProgress({ domain, execution }: { domain: string; execution: OnboardingExecution | null }) {
  const current = execution?.stage ?? "site"
  const currentPosition = stagePosition(current)
  const failed = execution?.status === "falhou" || current === "falhou"
  return <main className="intent-onboarding-main intent-pipeline-main">
    <section className="intent-pipeline">
      <header className="intent-pipeline-heading">
        <p>Configuração inteligente</p>
        <h1>Analisando <span>{domain}</span></h1>
        <div className="intent-progress-track" aria-label={`Progresso real: ${execution?.progress ?? 0}%`}><span style={{ width: `${execution?.progress ?? 0}%` }} /></div>
        <small>{execution?.message ?? "Preparando a análise das fontes públicas."}</small>
      </header>
      <div className="intent-stages">
        {ONBOARDING_STAGES.map((stage, index) => {
          const done = !failed && currentPosition > index
          const active = !failed && currentPosition === index
          return <article className={`intent-stage ${done ? "is-done" : ""} ${active ? "is-active" : ""}`} key={stage.id}>
            <div className="intent-stage-icon">{icons[index]}</div>
            <div><h2>{stage.title}</h2><p>{stage.description}</p>{active && <small>{execution?.message}</small>}</div>
            <div className="intent-stage-status">{done ? <Check size={16} /> : active ? <LoaderCircle className="intent-spin" size={17} /> : <span>{index + 1}</span>}</div>
          </article>
        })}
      </div>
      {failed && <div className="intent-pipeline-error" role="alert"><TriangleAlert size={18} /><div><strong>A análise não foi concluída</strong><p>{execution?.error ?? execution?.message ?? "Tente novamente."}</p></div></div>}
      <p className="intent-pipeline-footnote">O avanço exibido vem da execução real no back-end. Esta tela não simula etapas.</p>
    </section>
  </main>
}
