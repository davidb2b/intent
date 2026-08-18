export type SourceMeta = {
  posts?: number
  comentarios?: number
  reacoes?: number
  pessoas?: number
  icp?: number
  razao_comentarios_reacoes?: number
  pre_visualizacao_post?: string
}

export function parseSourceMeta(value: string | null): SourceMeta {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as SourceMeta : {}
  } catch {
    return {}
  }
}
