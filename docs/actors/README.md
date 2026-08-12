# Validação dos Actors

Esta pasta recebe os JSONs reais do Passo 0 antes da migration final.

Arquivos esperados:

- `linkedin-post-search.json`
- `linkedin-post-comments.json`
- `linkedin-profile-detail.json` quando houver uma execução de enriquecimento

Checklist obrigatório:

- `profileScraperMode: "main"` retorna empresa atual estruturada ou somente
  `position`/headline?
- setor e porte existem no retorno?
- `actor.linkedinUrl` é preenchido e estável?
- qual é o custo real de leitura e de enriquecimento?

Os arquivos devem conter saída do Actor, nunca credenciais, cookies ou tokens.
