# Validação dos Actors

Esta pasta contém as saídas reais usadas no Passo 0. A migration final só deve
ser aplicada depois desta validação de contrato.

## Amostras salvas

- [`linkedin-post-search.json`](../amostras/linkedin-post-search.json)
- [`linkedin-post-comments.json`](../amostras/linkedin-post-comments.json)
- [`linkedin-profile-location-validation.json`](../amostras/linkedin-profile-location-validation.json)
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

Para a verificação de origem brasileira, a descoberta usa
`harvestapi/linkedin-profile-scraper` em lote de até 25 URLs de autores. O
retorno só é aceito quando a URL normalizada corresponde ao autor encontrado
na busca de posts e a localização confirma Brasil. O lote evita uma chamada
sequencial por autor e mantém o custo dentro do teto da execução.

`apimaestro/linkedin-profile-detail` permanece como fallback estreito para uma
indisponibilidade do provider em lote. Ele nunca libera uma fonte sem a
localização brasileira explícita. O limite gratuito observado nesse Actor é
tratado como erro explícito; não deve ser convertido em lista vazia ou dado
estrangeiro.

Os arquivos contêm somente saída dos Actors; nunca devem conter credenciais,
cookies ou tokens.

## Validação de origem brasileira — 13 de agosto de 2026

Uma execução controlada do Actor de perfil retornou dois registros e custo de
US$ 0,008. O perfil brasileiro retornou `location.countryCode: "BR"` e foi
aceito pela regra. O perfil estrangeiro retornou `location.countryCode: "UA"`
e foi rejeitado. A amostra preserva apenas URL canônica e país, sem texto de
perfil, imagem, e-mail ou histórico profissional.
