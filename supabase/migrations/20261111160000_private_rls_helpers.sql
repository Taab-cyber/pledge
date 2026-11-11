-- Move RLS helper functions out of the API-exposed public schema.
-- Policies reference functions by OID, so they keep working after the move.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter function public.can_access_deal(uuid) set schema private;
alter function public.can_access_milestone(uuid) set schema private;
