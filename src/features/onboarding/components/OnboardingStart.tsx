import { ArrowRight, Globe2 } from "lucide-react"
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { normalizePublicSiteUrl } from "../domain/onboarding"

export function OnboardingStart({ initialUrl, busy, onStart }: { initialUrl?: string | null; busy: boolean; onStart: (url: string) => Promise<void> }) {
  const [site, setSite] = useState(initialUrl ?? "")
  const [error, setError] = useState("")
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      setError("")
      await onStart(normalizePublicSiteUrl(site))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível iniciar a análise.")
    }
  }
  return <main className="intent-onboarding-main">
    <section className="intent-onboarding-hero">
      <div className="intent-hero-icon"><Globe2 size={22} /></div>
      <h1>Comece pelo site da empresa.<br />O Intent revela onde estão as oportunidades.</h1>
      <p>Em poucos minutos, reunimos informações públicas para criar o perfil de cliente ideal, identificar quem compra e reconhecer os sinais que merecem atenção. Você revisa tudo antes de ativar.</p>
      <form className="intent-url-box" onSubmit={submit}>
        <Input aria-label="Site da empresa" autoComplete="url" disabled={busy} placeholder="https://empresa.com.br" value={site} onChange={(event) => setSite(event.target.value)} />
        <Button disabled={busy || !site.trim()} type="submit">{busy ? "Preparando análise…" : "Criar perfil ideal"}<ArrowRight size={16} /></Button>
      </form>
      {error && <p className="intent-inline-error" role="alert">{error}</p>}
      <p className="intent-trust-note">Usamos somente informações públicas. Você mantém o controle da revisão e do consumo de créditos em todas as etapas.</p>
    </section>
  </main>
}
