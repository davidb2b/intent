import { Check, TriangleAlert } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { ONBOARDING_STAGES, stagePosition, type OnboardingExecution } from "../domain/onboarding"
import { productErrorMessage, productStatusMessage } from "@/lib/product-messages"

const icons = ["🌐", "🔎", "💼", "🧠"]

export function OnboardingProgress({ domain, execution }: { domain: string; execution: OnboardingExecution | null }) {
  const current = execution?.stage ?? "site"
  const currentPosition = stagePosition(current)
  const failed = execution?.status === "falhou" || current === "falhou"
  return <main className="intent-onboarding-main intent-pipeline-main">
    <section className="intent-pipeline">
      <header className="intent-pipeline-heading">
        <p>Seu Intent está ganhando contexto</p>
        <h1>Conhecendo <span>{domain}</span></h1>
        <div className="intent-progress-track" aria-label={`Progresso da análise: ${execution?.progress ?? 0}%`}><span style={{ width: `${execution?.progress ?? 0}%` }} /></div>
        <small>{productStatusMessage(execution?.message, "Reunindo as primeiras informações públicas.")}</small>
      </header>
      <div className="intent-stages">
        {ONBOARDING_STAGES.map((stage, index) => {
          const done = !failed && currentPosition > index
          const active = !failed && currentPosition === index
          return <article className={`intent-stage ${done ? "is-done" : ""} ${active ? "is-active" : ""}`} key={stage.id}>
            <div className="intent-stage-icon">{icons[index]}</div>
            <div><h2>{stage.title}</h2><p>{stage.description}</p>{active && <small>{productStatusMessage(execution?.message, "Esta etapa está em andamento.")}</small>}</div>
            <div className="intent-stage-status">{done ? <Check size={16} /> : active ? <Spinner label={`${stage.title} em andamento`} /> : <span>{index + 1}</span>}</div>
          </article>
        })}
      </div>
      {failed && <div className="intent-pipeline-error" role="alert"><TriangleAlert size={18} /><div><strong>Não conseguimos concluir esta etapa</strong><p>{productErrorMessage(execution?.error ?? execution?.message, "Seus dados estão seguros. Aguarde alguns instantes e tente novamente.")}</p></div></div>}
      <p className="intent-pipeline-footnote">Acompanhe cada etapa com transparência. Somente informações confirmadas entram no seu perfil ideal.</p>
    </section>
  </main>
}
