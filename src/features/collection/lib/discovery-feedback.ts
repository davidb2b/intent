import type { DiscoverSourcesResult } from "@/features/collection/services/discover-sources"

export function discoveryFeedback(result: DiscoverSourcesResult, keyword: string) {
  if (result.postsFound === 0) {
    return `Ainda não encontramos conversas públicas para “${keyword}” neste período. Tente um termo mais amplo ou adicione um contexto ligado ao mercado brasileiro.`
  }

  if (result.candidatesInserted === 0) {
    return `Encontramos ${result.postsFound} posts para “${keyword}”, mas ainda não foi possível confirmar perfis brasileiros relevantes. Ajuste o contexto ou tente novamente mais tarde.`
  }

  return `Encontramos ${result.postsFound} posts e ${result.candidatesInserted} perfis brasileiros para “${keyword}”. Revise as sugestões e escolha quem deseja acompanhar.`
}
