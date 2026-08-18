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
      <h1>Cole o site do cliente.<br />O Intent monta a pesquisa inteira.</h1>
      <p>A partir do domínio, o Intent lê o site, encontra a company page no LinkedIn, descobre os concorrentes e gera o ICP completo — quem compra e como reconhecer que está comprando. Tudo editável antes de ativar.</p>
      <form className="intent-url-box" onSubmit={submit}>
        <Input aria-label="Site da empresa" autoComplete="url" disabled={busy} placeholder="https://empresa.com.br" value={site} onChange={(event) => setSite(event.target.value)} />
        <Button disabled={busy || !site.trim()} type="submit">{busy ? "Iniciando…" : "Analisar site"}<ArrowRight size={16} /></Button>
      </form>
      {error && <p className="intent-inline-error" role="alert">{error}</p>}
      <p className="intent-trust-note">A análise usa somente fontes públicas. O consumo inicial é de 12 créditos e os custos técnicos ficam registrados.</p>
    </section>
  </main>
}
