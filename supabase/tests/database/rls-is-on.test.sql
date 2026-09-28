-- Every table in the public schema has row level security on (ADR-002, security.md). A new table
-- that ships without it fails here, in CI, before it can serve rows to the anon key.
-- Run: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every table in the public schema has row level security on'
);

select * from finish();
rollback;
