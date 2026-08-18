const TECHNICAL_LANGUAGE = /\b(?:actor|apify|backend|back-end|crawler|dataset|digest|edge function|fetch|function|icpid|json|jwt|migration|non-2xx|onboarding|openai|payload|pgcrypto|pgrst|postgres|postgrest|projectid|provider|rls|rpc|schema|secret|sql|supabase)\b|company page|firmografia|status\s+[45]\d\d|does not exist|failed to send|network request|row returned|constraint|relation\s+.+\s+does not exist|column\s+.+\s+does not exist|duplicate key|invalid input syntax|violates|row-level security|null value in column|timeout|timed out/i

function text(value: unknown): string {
  if (value instanceof Error) return value.message.trim()
  return typeof value === "string" ? value.trim() : ""
}

export function productErrorMessage(value: unknown, fallback: string): string {
  const message = text(value)
  if (!message) return fallback

  if (/limite.*(?:diário|crédito)|crédito.*insuficiente|quota|rate limit|too many requests/i.test(message)) {
    return "O limite disponível para esta análise foi atingido. Seus dados estão preservados; tente novamente quando o saldo for renovado."
  }
  if (/tempo.*(?:esgot|limite)|timeout|timed out|demorou mais/i.test(message)) {
    return "Esta etapa levou mais tempo que o esperado. Seus dados estão seguros; aguarde alguns instantes e tente novamente."
  }
  if (/network|fetch|conexão|failed to send|indisponível|temporar/i.test(message)) {
    return "Não conseguimos acessar uma das fontes neste momento. Seus dados estão seguros; tente novamente em alguns instantes."
  }
  if (/schema|json|resposta.*inválid|não retornou|organizar as informações|evidência não encontrada/i.test(message)) {
    return "Não foi possível confirmar todas as informações com segurança. Nada foi publicado; revise os dados e tente novamente."
  }
  if (/digest|does not exist|constraint|row returned|projectid|icpid|rpc|postgres|sql|migration/i.test(message)) {
    return "Encontramos uma instabilidade ao concluir esta etapa. Nenhuma alteração foi perdida; tente novamente em alguns instantes."
  }
  if (TECHNICAL_LANGUAGE.test(message)) return fallback
  return message
}

export function authErrorMessage(value: unknown): string {
  const message = text(value)
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha não conferem. Revise os dados e tente novamente."
  if (/email not confirmed/i.test(message)) return "Confirme seu e-mail para continuar. Enviamos uma mensagem com o próximo passo."
  if (/user already registered|already been registered/i.test(message)) return "Este e-mail já possui uma conta. Entre com sua senha ou recupere o acesso."
  if (/password.*(?:six|6)|weak password/i.test(message)) return "Crie uma senha com pelo menos 6 caracteres."
  if (/rate limit|too many requests/i.test(message)) return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente."
  return productErrorMessage(message, "Não conseguimos concluir seu acesso agora. Tente novamente em alguns instantes.")
}

export function productStatusMessage(value: unknown, fallback: string): string {
  const message = text(value)
  if (!message) return fallback
  if (/company page.*(?:encontrada|confirmada)/i.test(message)) return "Perfil público encontrado. Confirmando os dados da empresa."
  if (/company page|firmografia/i.test(message)) return "Pesquisa de mercado concluída. Alguns dados da empresa precisarão de revisão."
  if (/lendo o site|pesquisando o mercado/i.test(message)) return "Conhecendo a empresa e o mercado ao redor dela."
  if (/conteúdo dinâmico|fallback.*navegador/i.test(message)) return "O site exige uma leitura mais detalhada. Estamos concluindo essa etapa."
  if (/ICP v\d+.*(?:pronto|validado|persistindo)/i.test(message)) return "Seu perfil ideal está pronto. Preparando a revisão."
  if (TECHNICAL_LANGUAGE.test(message)) return fallback
  return message
}

export function onboardingNotice(value: unknown): string | null {
  const message = text(value)
  if (!message) return null

  const notices: string[] = []
  if (/site não pôde|fallback do site|conteúdo do site não pôde/i.test(message)) {
    notices.push("Parte do site não estava disponível, então alguns campos podem precisar da sua revisão.")
  }
  if (/company page|linkedin|firmografia/i.test(message)) {
    notices.push("Alguns dados da empresa não puderam ser confirmados nas fontes públicas.")
  }
  if (/provas sociais/i.test(message)) {
    notices.push("Informações sem confirmação literal foram deixadas de fora para manter a análise confiável.")
  }
  if (/pesquisa de mercado/i.test(message)) {
    notices.push("A pesquisa de mercado ficou parcial; revise os concorrentes antes de ativar.")
  }

  return [...new Set(notices)].join(" ") || "Algumas informações precisam da sua revisão antes da ativação."
}
