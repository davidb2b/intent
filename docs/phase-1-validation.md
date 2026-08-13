# Fase 1 — validação da descoberta brasileira

Data: 13 de agosto de 2026

## O que foi validado

- A busca de posts do Actor `harvestapi/linkedin-post-search` não possui filtro
  de país. O termo do usuário é enviado sem acrescentar `Brasil`, pois a
  consulta `compras Brasil` retornou zero posts na validação real.
- A priorização brasileira ocorre após a busca: conteúdo com sinais de Brasil
  é priorizado para verificação, páginas de empresa nunca entram no Actor de
  perfil e a aceitação exige localização explícita `BR` no retorno do perfil.
- O contrato do `harvestapi/linkedin-profile-scraper` foi confirmado no console
  do Apify: a lista de perfis deve ser enviada no campo `queries`, e não
  `urls`. A implementação foi corrigida e publicada na Edge Function
  `discover-sources`.
- A interface publicada informa quando a busca não devolve posts e quantos
  perfis ficaram pendentes de verificação; não há sucesso silencioso.

## Execuções reais observadas

| Consulta | Resultado | Custo | Interpretação |
| --- | --- | ---: | --- |
| `compras Brasil` | 0 posts | US$ 0,00 | O acréscimo artificial de país reduziu a busca a zero resultados. |
| `compras` | 100 posts | US$ 0,11405 | A busca ampla funciona, mas a versão anterior enviou o campo errado para a verificação de perfil. |
| `compras` após a correção do contrato | 0 posts | US$ 0,00 | O Actor retornou conjunto vazio nesta execução; não houve inserção nem custo de perfil. |

## Integridade do dado

- Não foi inserido post, comentário, pessoa ou empresa estrangeira nas novas
  execuções desta fase.
- Fontes candidatas só são inseridas após o retorno do Actor de perfil com
  localização brasileira explícita; resultados ausentes permanecem pendentes,
  sem conversão em fonte.
- Não usamos URL de perfil pré-definida nem dado sintético para simular uma
  descoberta bem-sucedida.

## Gate para encerrar a Fase 1

Executar uma descoberta com uma palavra-chave e contexto de negócio definidos
na configuração, quando o Actor retornar posts novamente, e comprovar pelo
menos uma fonte com localização `BR` inserida como `candidata`. Só depois uma
fonte poderá ser aprovada para o monitoramento da Fase 2.
