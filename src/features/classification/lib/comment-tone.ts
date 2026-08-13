export type CommentFilter = "all" | "pain" | "question" | "experience" | "generic"

function normalize(value: string | null) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

export function matchesCommentFilter(tone: string | null, filter: CommentFilter) {
  if (filter === "all") return true
  const value = normalize(tone)
  if (filter === "pain") return value === "dor" || value.includes("pain")
  if (filter === "question") return value === "pergunta" || value.includes("question")
  if (filter === "experience") return value === "pratica" || value.includes("experien")
  return value === "generico" || value.includes("generic")
}

export function commentToneLabel(tone: string | null) {
  const value = normalize(tone)
  if (value === "dor") return "Dor"
  if (value === "pergunta") return "Pergunta"
  if (value === "fornecedor") return "Fornecedor"
  if (value === "pratica") return "Experiência"
  if (value === "generico") return "Genérico"
  return tone ?? "Pendente"
}
