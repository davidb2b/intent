# Intent

Motor people-first de intenção B2B. O produto cria um ICP versionado, mantém um
radar privado de pessoas brasileiras aderentes e apresenta somente sinais
públicos com evidência literal. O fluxo temático anterior permanece como
legado durante a migração.

## Fundação atual

- Vite + React + TypeScript + Bun
- Supabase client isolado em `src/infrastructure/supabase`
- catálogo de Actors em `src/infrastructure/apify`
- arquitetura e fluxo em `docs/architecture.md`
- validação operacional em `docs/phase-0-validation.md`
- migrations versionadas em `supabase/migrations/`; a fundação Intent v1 está
  em `0009` e o endurecimento de escrita do cliente em `0010`
- amostras de Actor em `docs/actors/`
- plano vigente em `docs/intent-v1/README.md`

## Desenvolvimento

```bash
bun install
cp .env.example .env.local
bun run dev
```

As variáveis `APIFY_TOKEN`, `OPENAI_API_KEY` e a service role key só serão
configuradas nas Edge Functions. Elas nunca devem entrar no bundle do Vite.
