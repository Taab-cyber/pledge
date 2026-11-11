-- Pledge: initial schema (BUILD.md §4).
-- Money is always integer minor units (bigint) + ISO-4217 currency.
-- RLS model: users can READ their own rows (freelancer: own deals; client: deals where client_id = them).
-- All writes except a user's own profile go through the server with the service role,
-- after the service layer has validated them. anon/authenticated get no write grants.

-- ── Enums ────────────────────────────────────────────────────────────────────
create type public.user_role as enum ('freelancer', 'client');
create type public.deal_status as enum ('draft', 'shared', 'approved', 'active', 'completed', 'cancelled');
create type public.milestone_kind as enum ('milestone', 'addon');
create type public.milestone_status as enum (
  'draft', 'awaiting_hold', 'held', 'hold_at_risk', 'delivered', 'changes_requested', 'released', 'voided'
);
create type public.agent_action_status as enum ('proposed', 'approved', 'executed', 'dismissed', 'auto_executed');

-- ── Helpers ──────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── profiles ─────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role,                      -- null until chosen; then fixed
  full_name text check (char_length(full_name) between 1 and 120),
  profession text check (char_length(profession) <= 120),
  country_code char(2) check (country_code ~ '^[A-Z]{2}$'),
  paypal_email text check (paypal_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Role is chosen once; is_demo and id are never user-editable.
create or replace function public.guard_profile_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if old.role is not null and new.role is distinct from old.role then
      raise exception 'ROLE_ALREADY_SET' using errcode = 'P0001';
    end if;
    if new.is_demo is distinct from old.is_demo or new.id is distinct from old.id then
      raise exception 'FORBIDDEN_FIELD' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Profile row is created on first login (first auth.users insert).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── deals ────────────────────────────────────────────────────────────────────
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  freelancer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid references public.profiles (id) on delete set null,
  client_name text not null check (char_length(client_name) between 1 and 120),
  client_whatsapp text check (client_whatsapp ~ '^\+?[0-9]{6,15}$'),
  client_country char(2) check (client_country ~ '^[A-Z]{2}$'),
  title text not null default '' check (char_length(title) <= 200),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  total_minor bigint not null check (total_minor > 0),
  status public.deal_status not null default 'draft',
  current_version int not null default 0 check (current_version >= 0),
  share_token_hash text unique,
  auto_release_hours int not null default 72 check (auto_release_hours between 1 and 720),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deals_client_not_freelancer check (client_id is null or client_id <> freelancer_id)
);
create index deals_freelancer_id_idx on public.deals (freelancer_id);
create index deals_client_id_idx on public.deals (client_id);
create index deals_share_token_hash_idx on public.deals (share_token_hash);
create trigger deals_updated_at before update on public.deals
  for each row execute function public.set_updated_at();

-- Access helpers used by RLS policies (security definer avoids recursive RLS lookups).
create or replace function public.can_access_deal(p_deal_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.deals d
    where d.id = p_deal_id and (d.freelancer_id = (select auth.uid()) or d.client_id = (select auth.uid()))
  );
$$;

-- ── deal_versions (immutable record of what the client saw/approved) ─────────
create table public.deal_versions (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  version int not null check (version >= 1),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (deal_id, version)
);

-- ── milestones ───────────────────────────────────────────────────────────────
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  kind public.milestone_kind not null default 'milestone',
  position int not null check (position >= 0),
  title text not null check (char_length(title) between 1 and 200),
  amount_minor bigint not null check (amount_minor > 0),
  due_date date,
  revisions_included int not null default 1 check (revisions_included >= 0),
  revisions_used int not null default 0 check (revisions_used >= 0),
  status public.milestone_status not null default 'draft',
  paypal_order_id text,
  authorization_id text,
  hold_expires_at timestamptz,
  honor_expires_at timestamptz,
  delivered_at timestamptz,
  release_at timestamptz,
  captured_at timestamptz,
  capture_id text unique,
  gross_minor bigint,
  fee_minor bigint,
  net_minor bigint,
  settlement_currency char(3) check (settlement_currency ~ '^[A-Z]{3}$'),
  fx_rate numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index milestones_deal_id_idx on public.milestones (deal_id);
create index milestones_status_release_at_idx on public.milestones (status, release_at);
create index milestones_status_honor_expires_at_idx on public.milestones (status, honor_expires_at);
create trigger milestones_updated_at before update on public.milestones
  for each row execute function public.set_updated_at();

create or replace function public.can_access_milestone(p_milestone_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.milestones m join public.deals d on d.id = m.deal_id
    where m.id = p_milestone_id and (d.freelancer_id = (select auth.uid()) or d.client_id = (select auth.uid()))
  );
$$;

-- ── todos ────────────────────────────────────────────────────────────────────
create table public.todos (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestones (id) on delete cascade,
  position int not null check (position >= 0),
  label text not null check (char_length(label) between 1 and 300),
  done boolean not null default false
);
create index todos_milestone_id_idx on public.todos (milestone_id);

-- ── deliveries ───────────────────────────────────────────────────────────────
create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestones (id) on delete cascade,
  round int not null check (round >= 1),
  note text not null default '' check (char_length(note) <= 5000),
  files jsonb not null default '[]'::jsonb,
  ai_check jsonb,
  created_at timestamptz not null default now(),
  unique (milestone_id, round)
);

-- ── change_requests ──────────────────────────────────────────────────────────
create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  milestone_id uuid references public.milestones (id) on delete cascade,
  from_role public.user_role not null,
  text text not null check (char_length(text) between 1 and 5000),
  ai_summary jsonb,
  created_at timestamptz not null default now()
);
create index change_requests_deal_id_idx on public.change_requests (deal_id);
create index change_requests_milestone_id_idx on public.change_requests (milestone_id);

-- ── consents ─────────────────────────────────────────────────────────────────
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  deal_version int not null,
  client_id uuid not null references public.profiles (id) on delete cascade,
  text text not null,
  text_sha256 char(64) not null check (text_sha256 ~ '^[0-9a-f]{64}$'),
  accepted_at timestamptz not null default now(),
  user_agent text,
  unique (deal_id, deal_version, client_id)
);
create index consents_client_id_idx on public.consents (client_id);

-- ── agent_actions (Deal Agent feed) ──────────────────────────────────────────
create table public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  milestone_id uuid references public.milestones (id) on delete cascade,
  kind text not null,
  title text not null,
  detail jsonb not null default '{}'::jsonb,
  status public.agent_action_status not null default 'proposed',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index agent_actions_deal_id_idx on public.agent_actions (deal_id, created_at desc);
create index agent_actions_milestone_id_idx on public.agent_actions (milestone_id);

-- ── events (append-only activity log) ────────────────────────────────────────
create table public.events (
  id bigint generated always as identity primary key,
  deal_id uuid not null references public.deals (id) on delete cascade,
  milestone_id uuid references public.milestones (id) on delete cascade,
  actor_role text not null check (actor_role in ('freelancer', 'client', 'system', 'agent')),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index events_deal_id_idx on public.events (deal_id, created_at desc);
create index events_milestone_id_idx on public.events (milestone_id);

create or replace function public.forbid_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'APPEND_ONLY: % is append-only', tg_table_name using errcode = 'P0001';
end $$;
create trigger events_append_only before update or delete on public.events
  for each row execute function public.forbid_mutation();
create trigger deal_versions_immutable before update on public.deal_versions
  for each row execute function public.forbid_mutation();

-- ── webhook_events ───────────────────────────────────────────────────────────
create table public.webhook_events (
  id text primary key,                        -- PayPal event id
  type text not null,
  received_at timestamptz not null default now(),
  payload jsonb not null
);

-- ── ai_runs ──────────────────────────────────────────────────────────────────
create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  task text not null,
  model text not null,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index ai_runs_user_id_created_at_idx on public.ai_runs (user_id, created_at desc);

-- ── Row-level security ───────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.deals enable row level security;
alter table public.deal_versions enable row level security;
alter table public.milestones enable row level security;
alter table public.todos enable row level security;
alter table public.deliveries enable row level security;
alter table public.change_requests enable row level security;
alter table public.consents enable row level security;
alter table public.agent_actions enable row level security;
alter table public.events enable row level security;
alter table public.webhook_events enable row level security;
alter table public.ai_runs enable row level security;

-- Clients and freelancers only ever read through RLS; writes go through the server.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from anon;
grant select on all tables in schema public to authenticated;
grant update (role, full_name, profession, country_code, paypal_email) on public.profiles to authenticated;

create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy deals_select_party on public.deals for select to authenticated
  using (freelancer_id = (select auth.uid()) or client_id = (select auth.uid()));

create policy deal_versions_select_party on public.deal_versions for select to authenticated
  using (public.can_access_deal(deal_id));
create policy milestones_select_party on public.milestones for select to authenticated
  using (public.can_access_deal(deal_id));
create policy todos_select_party on public.todos for select to authenticated
  using (public.can_access_milestone(milestone_id));
create policy deliveries_select_party on public.deliveries for select to authenticated
  using (public.can_access_milestone(milestone_id));
create policy change_requests_select_party on public.change_requests for select to authenticated
  using (public.can_access_deal(deal_id));
create policy consents_select_party on public.consents for select to authenticated
  using (public.can_access_deal(deal_id));
create policy agent_actions_select_party on public.agent_actions for select to authenticated
  using (public.can_access_deal(deal_id));
create policy events_select_party on public.events for select to authenticated
  using (public.can_access_deal(deal_id));
create policy ai_runs_select_own on public.ai_runs for select to authenticated
  using (user_id = (select auth.uid()));
-- webhook_events: no policies → service role only.

revoke execute on function public.can_access_deal(uuid) from anon, public;
revoke execute on function public.can_access_milestone(uuid) from anon, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
