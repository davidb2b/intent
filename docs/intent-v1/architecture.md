# Arquitetura alvo — Intent v1

## Princípios

- SRP: coleta, normalização, julgamento, créditos e apresentação são módulos
  diferentes.
- DIP: casos de uso dependem de portas próprias; Apollo, Apify, OpenAI e
  Supabase são adapters substituíveis.
- Dados externos brutos são preservados para auditoria, mas não vazam para UI.
- Toda mutação externa é server-side e idempotente.
- Um item com falha não derruba o lote inteiro.

## Limites de confiança

```text
Browser (publishable key)
  -> Edge Function autenticada
    -> caso de uso
      -> portas de domínio
        -> Apollo adapter
        -> Apify adapter
        -> LLM adapter
        -> repositórios Supabase/service role
```

O browser pode consultar apenas projeções públicas do workspace. Contatos,
fit, payloads brutos, custos USD, jobs e radar são privados ao backend.

## Módulos propostos

```text
src/
  app/                       rotas e composição
  components/ui/             shadcn e componentes transversais
  features/
    onboarding/              site, progresso e geração de ICP
    icp/                     edição, versão e ativação
    dashboard/               início e indicadores
    people/                  lista e drawer
    accounts/                contas em movimento
    watchlist/               páginas e pessoas
    classification/          teste controlado de julgamento
    credits/                 saldo e revelação de contato
    intent/domain/           tipos e regras puras
  infrastructure/
    supabase/                client público

supabase/functions/
  generate-icp/
  seed-radar/
  enqueue-monitoring/
  process-jobs/
  judge-signal/
  reveal-contact/
  _shared/
    domain/
    apollo/
    apify/
    llm/
    repositories/
```

Nenhum componente React importa contratos ou SDKs de fornecedor.

## Pipeline de onboarding

1. `generate-icp` valida URL e ownership do projeto.
2. Cria execução idempotente e reserva 12 créditos.
3. Site, Google e LinkedIn da empresa rodam em paralelo.
4. Cada adapter grava raw payload, proveniência, custo e completude.
5. Três operações LLM rodam em sequência com schema estrito.
6. O rascunho ICP é persistido somente após validação completa.
7. Falha parcial preserva o que foi coletado e mostra aviso acionável.
8. Ativação arquiva a versão anterior e enfileira `seed-radar`.

## Pipeline do motor

```text
seed-radar
  -> pessoas(vigiado)
  -> vigiar_pessoa
  -> sinais brutos
  -> higiene
  -> fit interno
  -> intenção
  -> pessoa visível
  -> varrer_empresa + varrer_post + investigar_autor
```

## Contrato operacional dos jobs

Campos mínimos além da spec:

- `tentativas`, `max_tentativas`;
- `disponivel_em` para backoff;
- `locked_at`, `locked_by`, `lease_expires_at` para recuperação;
- `payload_hash` para dedupe;
- `ultimo_erro_codigo`, `ultimo_erro_detalhe`;
- `creditos_reservados` e `custo_estimado_usd`;
- timestamps de início, conclusão e próxima tentativa.

O worker reivindica itens com `FOR UPDATE SKIP LOCKED`. Conclusão, sinais,
custos e lançamento de crédito acontecem na mesma transação lógica. Uma lease
expirada devolve o job para a fila.

## Créditos

Não calcular saldo apenas com `plano - sum(eventos)` em múltiplos workers sem
lock. Usar ledger imutável e função SQL transacional:

1. bloquear a conta de crédito do projeto;
2. calcular saldo vigente;
3. reservar antes da operação;
4. confirmar consumo no sucesso;
5. estornar a reserva em falha não cobrável.

`referencia` deve ser idempotente, por exemplo `job:<uuid>:judge`.

## Segurança de contatos

E-mail e telefone não ficam numa tabela legível pelo browser. Proposta:

- `pessoas`: campos públicos e flags `email_disponivel`/`telefone_disponivel`;
- `pessoa_contatos_privados`: valores criptografados ou server-only, sem policy
  de leitura para usuário comum;
- `reveal-contact`: verifica ownership, saldo e idempotência; debita e devolve
  somente o contato solicitado;
- `contatos_revelados`: mantém a concessão para não cobrar duas vezes.

## Observabilidade

Cada integração registra `provider`, `operation`, `external_run_id`, latência,
itens, custo, tentativa, erro tipado e completude. Resultado vazio, resposta
parcial e falha são estados diferentes.

