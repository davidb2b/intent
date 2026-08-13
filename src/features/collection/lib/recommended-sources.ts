type CandidateSource = {
  id: string
  status: "monitorada" | "candidata" | "descartada"
  posts: number
  comments: number
  ratio: number
}

export function recommendedSourceIds(sources: CandidateSource[], limit = 3) {
  return sources
    .filter((source) => source.status === "candidata")
    .sort((first, second) => second.ratio - first.ratio || second.comments - first.comments || second.posts - first.posts)
    .slice(0, limit)
    .map((source) => source.id)
}
