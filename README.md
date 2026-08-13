# Signal Lab

Pesquisa de sinais públicos de mercado no LinkedIn para a categoria do
projeto. O produto parte de temas e fontes monitoradas; não faz outreach,
disparo ou integração com CRM.

## Fundação atual

- Vite + React + TypeScript + Bun
- Supabase client isolado em `src/infrastructure/supabase`
- catálogo de Actors em `src/infrastructure/apify`
- arquitetura e fluxo em `docs/architecture.md`
- validação operacional em `docs/phase-0-validation.md`
- migration inicial em `supabase/migrations/0001_signal_lab.sql`
- amostras de Actor em `docs/actors/`

## Desenvolvimento

```bash
bun install
cp .env.example .env.local
bun run dev
```

As variáveis `APIFY_TOKEN`, `OPENAI_API_KEY` e a service role key só serão
configuradas nas Edge Functions. Elas nunca devem entrar no bundle do Vite.
