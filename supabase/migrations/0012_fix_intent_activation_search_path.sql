-- Supabase installs pgcrypto in the `extensions` schema. Keep `public` in the
-- path for local Postgres installations while resolving digest safely in prod.
alter function public.intent_activate_icp(uuid, uuid)
  set search_path = pg_catalog, public, extensions;
