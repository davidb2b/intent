function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6">
      <section className="w-full max-w-xl rounded-2xl border border-emerald-950/10 bg-white p-10 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">
          Signal Lab
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
          Fundação pronta
        </h1>
        <p className="mt-3 text-slate-600">
          O workspace está preparado para autenticação, coleta, normalização e
          curadoria de sinais públicos.
        </p>
        <p className="mt-8 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Próxima etapa: validar a amostra real de comentários antes de aplicar
          o schema definitivo.
        </p>
      </section>
    </main>
  )
}

export default App
