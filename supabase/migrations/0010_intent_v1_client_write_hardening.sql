-- Commercial status is changed only by authenticated backend operations.
-- The browser keeps the existing human-review fields and cannot promote a
-- person directly to lead, client or out-of-ICP.
revoke update (status) on public.pessoas from authenticated;
