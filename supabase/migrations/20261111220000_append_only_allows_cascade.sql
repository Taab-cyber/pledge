-- The activity log stays append-only for direct UPDATE/DELETE, but rows may be removed when their
-- deal (or the owning account) is deleted. Cascading FK deletes run inside the RI trigger, so the
-- trigger depth is > 1 there; a direct DELETE runs at depth 1.
create or replace function public.forbid_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'APPEND_ONLY: % is append-only', tg_table_name using errcode = 'P0001';
end $$;

insert into private.schema_migrations (name) values ('20261111220000_append_only_allows_cascade.sql')
on conflict do nothing;
