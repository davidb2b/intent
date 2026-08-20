# Intent v1 — roteiro de homologação do cliente

Este roteiro orienta o primeiro teste do Intent. A experiência segue o fluxo do
protótipo oficial e utiliza somente dados reais disponíveis para a conta.

## Antes de começar

- Entre com a conta individual recebida. Cada usuário visualiza apenas a própria
  operação.
- Confirme se o nome e o domínio da empresa estão corretos.
- Não compartilhe senha, contato revelado ou informações privadas em capturas.

## 1. Definir o perfil ideal

1. Abra **ICP**.
2. Revise os cargos, senioridades, setores, portes, regiões, dores, gatilhos e
   exclusões sugeridos a partir do site.
3. Ajuste o que não representar a operação.
4. Ative a versão revisada.

Resultado esperado: a versão ativa fica identificada e passa a orientar a
seleção e a priorização de pessoas.

## 2. Acompanhar o radar

Na tela **Início**, confira:

- pessoas com intenção acompanhada;
- pessoas aderentes ao perfil ideal;
- contas relacionadas;
- perfis e páginas acompanhados.

Os cartões e listas refletem dados processados da operação. Ausência de sinal é
mostrada como estado vazio; não são criados resultados artificiais.

## 3. Trabalhar as pessoas

1. Abra **Pessoas**.
2. Alterne entre **Intenção forte**, **Sinal fraco**, **Clientes** e **Todas**.
3. Selecione uma pessoa para abrir os detalhes.
4. Confira a nota de intenção, o motivo de aderência ao ICP e a evidência
   pública que sustenta a classificação.
5. Use **Abrir no LinkedIn** para conferir a fonte pública.

Contato só é consultado após confirmação. A tela informa o custo antes da
consulta, e o crédito só é consumido quando o provedor disponibiliza um contato.

Ao marcar alguém como cliente, essa pessoa sai da fila de abordagem e passa a
ser desconsiderada nas próximas sugestões.

## 4. Avaliar contas

Abra **Contas** para enxergar pessoas e sinais consolidados por empresa:

- **Em movimento**: mais de uma pessoa da mesma empresa demonstrou sinal;
- **Aquecendo**: existe sinal relevante, ainda concentrado;
- **Fria**: a conta foi identificada, mas ainda não reuniu sinais suficientes.

## 5. Organizar a Watchlist

Abra **Watchlist** e revise separadamente perfis de pessoas e páginas de
empresas. Sugestões só entram no acompanhamento recorrente depois de aprovadas.
Itens recusados deixam de aparecer como recomendação.

## 6. Validar a classificação

Em **Testar classificação**, cole uma evidência pública e execute **Avaliar
sinal**. O teste apresenta o resultado da mesma régua de produto sem alterar os
dados da operação.

## Comportamentos que devem ser conferidos

- carregamentos exibem indicador e explicam o que está acontecendo;
- resultados anteriores permanecem visíveis durante atualizações;
- erros mostram uma orientação compreensível, sem mensagens internas;
- perfis sem evidência não aparecem como oportunidade;
- o mesmo post, pessoa ou sinal não é duplicado em uma nova execução;
- cada conta permanece isolada das demais.

## Dependências para o aceite final

- observar uma execução recorrente completa da Watchlist em produção;
- realizar uma consulta real de contato em um perfil elegível;
- conectar o destino do CRM, caso o envio ao CRM faça parte do teste do cliente;
- registrar o aceite do David antes do merge final em produção.
