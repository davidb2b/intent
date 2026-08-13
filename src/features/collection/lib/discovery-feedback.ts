import type { DiscoverSourcesResult } from "@/features/collection/services/discover-sources"

export function discoveryFeedback(result: DiscoverSourcesResult, keyword: string) {
  if (result.postsFound === 0) {
    return `Não encontramos posts públicos para “${keyword}” nesta janela. Nenhuma fonte foi criada. Tente um termo mais amplo ou adicione contexto ligado ao mercado brasileiro.`
  }

  if (result.candidatesInserted === 0) {
    return `Analisamos ${result.postsFound} posts para “${keyword}”, mas nenhum autor pôde ser confirmado como perfil brasileiro. Nenhuma fonte foi ativada; ajuste o termo ou tente novamente mais tarde.`
  }

  return `Descoberta concluída: ${result.postsFound} posts analisados e ${result.candidatesInserted} perfis brasileiros encontrados. Revise e ative uma fonte para iniciar a coleta de posts e comentários.`
}
