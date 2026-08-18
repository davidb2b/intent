import { Eye, EyeOff, LoaderCircle } from "lucide-react"
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { authService } from "@/features/auth/services/auth-service"

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
    const result = mode === "signin" ? await authService.signInWithPassword(email, password)
      : mode === "signup" ? await authService.signUp(email, password)
      : await authService.resetPasswordForEmail(email, `${window.location.origin}/reset-password`)
    setBusy(false)
    if (result.error) { setError(result.error.message); return }
    if (mode === "signup") setMessage("Conta criada. Verifique seu e-mail caso a confirmação esteja habilitada.")
    if (mode === "recovery") setMessage("Enviamos o link de recuperação para seu e-mail.")
  }

  return <main className="intent-auth-screen">
    <section className="intent-auth-card">
      <a className="intent-brand" href="/"><span>In</span>Intent</a>
      <header><h1>{mode === "signin" ? "Entre no seu workspace" : mode === "signup" ? "Crie sua conta" : "Recupere sua senha"}</h1><p>{mode === "signin" ? "Encontre quem é ICP e está em momento de compra." : mode === "signup" ? "Comece pelo site da empresa e deixe o Intent montar a pesquisa." : "Receba um link seguro para definir uma nova senha."}</p></header>
      <form onSubmit={submit}>
        <label htmlFor="intent-auth-email">E-mail</label><Input autoComplete="email" id="intent-auth-email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
        {mode !== "recovery" && <><label htmlFor="intent-auth-password">Senha</label><div className="intent-password-field"><Input autoComplete={mode === "signin" ? "current-password" : "new-password"} id="intent-auth-password" minLength={6} onChange={(event) => setPassword(event.target.value)} required type={visible ? "text" : "password"} value={password} /><button aria-label={visible ? "Ocultar senha" : "Mostrar senha"} onClick={() => setVisible((current) => !current)} type="button">{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></>}
        {error && <p className="intent-auth-error" role="alert">{error}</p>}{message && <p className="intent-auth-success">{message}</p>}
        <Button disabled={busy} type="submit">{busy && <LoaderCircle className="intent-spin" size={15} />}{mode === "signin" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link"}</Button>
      </form>
      <footer>{mode === "signin" ? <><button onClick={() => setMode("recovery")} type="button">Esqueci minha senha</button><span>Ainda não tem conta? <button onClick={() => setMode("signup")} type="button">Criar conta</button></span></> : <button onClick={() => setMode("signin")} type="button">← Voltar para o login</button>}</footer>
    </section>
  </main>
}
