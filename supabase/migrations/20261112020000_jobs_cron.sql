-- Phase 6: call POST <APP_URL>/api/jobs/tick every 15 minutes (pg_cron + pg_net).
-- The URL and the jobs secret live in Supabase Vault (encrypted), set by scripts/set-tick-config.ts
-- through public.set_tick_config (service_role only), so the secret never appears in SQL or logs.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.set_tick_config(p_url text, p_secret text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v uuid;
begin
  select id into v from vault.secrets where name = 'pledge_tick_url';
  if v is null then perform vault.create_secret(p_url, 'pledge_tick_url', 'Pledge tick endpoint');
  else perform vault.update_secret(v, p_url); end if;

  select id into v from vault.secrets where name = 'pledge_jobs_secret';
  if v is null then perform vault.create_secret(p_secret, 'pledge_jobs_secret', 'x-jobs-secret for the tick');
  else perform vault.update_secret(v, p_secret); end if;
end $$;
revoke execute on function public.set_tick_config(text, text) from public, anon, authenticated;
grant execute on function public.set_tick_config(text, text) to service_role;

-- The job itself: no secret in its text; it reads both values from Vault at run time.
create or replace function private.call_tick() returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'pledge_tick_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'pledge_jobs_secret');
begin
  if v_url is null or v_secret is null then return null; end if;
  return net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-jobs-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;
revoke execute on function private.call_tick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'pledge-tick';
select cron.schedule('pledge-tick', '*/15 * * * *', 'select private.call_tick()');

insert into private.schema_migrations (name) values ('20261112020000_jobs_cron.sql')
on conflict do nothing;
