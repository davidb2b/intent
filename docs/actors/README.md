# Validação dos Actors

Esta pasta contém as saídas reais usadas no Passo 0. A migration final só deve
ser aplicada depois desta validação de contrato.

## Amostras salvas

- [`linkedin-post-search.json`](../amostras/linkedin-post-search.json)
- [`linkedin-post-comments.json`](../amostras/linkedin-post-comments.json)
- `linkedin-profile-detail.json` permanece opcional para uma etapa posterior de
  enriquecimento direcionado.

## Execuções realizadas

### 1. Descoberta de posts

- Actor: `harvestapi/linkedin-post-search`
- Consulta: `procurement`
- Limite: 5 posts
- Resultado: 5 posts
- Custo exibido pela execução: `$0.010`
- Um dos posts retornou 22 comentários e foi usado como entrada da segunda
  execução.

### 2. Coleta de comentários

- Actor: `harvestapi/linkedin-post-comments`
- Entrada: o post com 22 comentários da amostra acima
- `maxItems: 10`
- `profileScraperMode: "main"`
- `scrapeReplies: false`
- Resultado: 10 comentários
- Custo exibido pela execução: `$0.042`

## Resultado do contrato observado

- `actor.linkedinUrl` veio preenchido nos 10 comentários, com URL pública de
  perfil ou de empresa. Ele é adequado como identificador de origem, mas deve
  ser normalizado e acompanhado pelo `actor.id` quando disponível.
- Para perfis, o retorno não traz uma empresa atual simples em um campo único:
  `currentPosition` pode vir vazio, enquanto `experience[]` traz o histórico e
  inclui `companyName`, `companyLinkedinUrl`, `companyId` e datas quando
  disponíveis.
- Para páginas de empresa, o retorno foi mais rico: trouxe `industries`,
  `employeeCountRange`, `employeeCount`, `followerCount`, `companyType` e
  descrição.
- Portanto, setor e porte existem para alguns atores de empresa, mas não podem
  ser considerados obrigatórios para atores de perfil. O schema deve aceitar
  ausência desses campos e preservar o payload bruto.
- O campo `position` não deve ser interpretado como cargo em todos os casos:
  para uma empresa ele apareceu como contagem de seguidores; para perfis ele
  funcionou como headline/posição pública.

## Decisão para o V1

O par principal validado é `linkedin-post-search` +
`linkedin-post-comments`. A coleta deve persistir o payload bruto, uma camada
normalizada mínima e um vínculo entre comentário, post e ator. O enriquecimento
de empresa/perfil será tratado separadamente, sem bloquear a descoberta.

O Actor `apimaestro/linkedin-profile-detail` fica como enriquecimento
direcionado/futuro, e não como dependência da primeira coleta. O fallback deve
ser encapsulado por uma interface de provider, porque seu formato de saída não
é garantidamente idêntico ao HarvestAPI.

Os arquivos contêm somente saída dos Actors; nunca devem conter credenciais,
cookies ou tokens.
