-- Keep incomplete legacy discoveries for audit, but never let them reappear
-- as candidate or monitored sources.
update public.fontes
set status = 'descartada'
where status <> 'descartada'
  and (nome is null or char_length(btrim(nome)) < 2);

alter table public.fontes
  add constraint fontes_require_identity_when_visible
  check (
    status = 'descartada'
    or (nome is not null and char_length(btrim(nome)) >= 2)
  );
