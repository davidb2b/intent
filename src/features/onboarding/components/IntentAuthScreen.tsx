import { Eye, EyeOff } from "lucide-react"
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { authService } from "@/features/auth/services/auth-service"
import { authErrorMessage } from "@/lib/product-messages"

type Mode = "signin" | "signup" | "recovery"

export function IntentAuthScreen() {
  const [mode, setMode] = useState<Mode>("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setError(""); setMessage("")
    try {
      const result = mode === "signin" ? await authService.signInWithPassword(email, password)
        : mode === "signup" ? await authService.signUp(email, password)
        : await authService.resetPasswordForEmail(email, `${window.location.origin}/reset-password`)
      if (result.error) { setError(authErrorMessage(result.error)); return }
      if (mode === "signup") setMessage("Sua conta foi criada. Confira seu e-mail para confirmar o acesso e começar.")
      if (mode === "recovery") setMessage("Enviamos as instruções para seu e-mail. Abra a mensagem para criar uma nova senha.")
    } catch (caught) {
      setError(authErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return <main className="intent-auth-screen">
    <section className="intent-auth-card">
      <a className="intent-brand" href="/"><span>In</span>Intent</a>
      <header><h1>{mode === "signin" ? "Bem-vindo ao Intent" : mode === "signup" ? "Crie sua conta" : "Recupere seu acesso"}</h1><p>{mode === "signin" ? "Descubra as pessoas e empresas que demonstram intenção de compra." : mode === "signup" ? "Comece pelo site da empresa e transforme informações públicas em oportunidades." : "Informe seu e-mail para receber as instruções de recuperação."}</p></header>
      <form onSubmit={submit}>
        <label htmlFor="intent-auth-email">E-mail</label><Input autoComplete="email" id="intent-auth-email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
        {mode !== "recovery" && <><label htmlFor="intent-auth-password">Senha</label><div className="intent-password-field"><Input autoComplete={mode === "signin" ? "current-password" : "new-password"} id="intent-auth-password" minLength={6} onChange={(event) => setPassword(event.target.value)} required type={visible ? "text" : "password"} value={password} /><button aria-label={visible ? "Ocultar senha" : "Mostrar senha"} onClick={() => setVisible((current) => !current)} type="button">{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></>}
        {error && <p className="intent-auth-error" role="alert">{error}</p>}{message && <p className="intent-auth-success">{message}</p>}
        <Button disabled={busy} type="submit">{busy && <Spinner label={mode === "signin" ? "Entrando no Intent" : mode === "signup" ? "Criando sua conta" : "Enviando instruções"} />}{busy ? mode === "signin" ? "Entrando…" : mode === "signup" ? "Criando conta…" : "Enviando…" : mode === "signin" ? "Entrar no Intent" : mode === "signup" ? "Começar agora" : "Enviar instruções"}</Button>
      </form>
      <footer>{mode === "signin" ? <><button onClick={() => setMode("recovery")} type="button">Esqueci minha senha</button><span>Ainda não tem conta? <button onClick={() => setMode("signup")} type="button">Criar conta</button></span></> : <button onClick={() => setMode("signin")} type="button">← Voltar para o login</button>}</footer>
    </section>
  </main>
}
