-- Phase 4: PayPal holds and captures.
-- capture_claim: a release (client approval or auto-release) must first claim the milestone with a
-- conditional update; only one caller can win, so a milestone is captured at most once.
alter table public.milestones
  add column capture_claim text,
  add column capture_attempts int not null default 0 check (capture_attempts >= 0),
  add column hold_order_attempts int not null default 0 check (hold_order_attempts >= 0),
  add column receivable_minor bigint,
  add column capture_status text,
  add column last_payment_error jsonb;

create index milestones_authorization_id_idx on public.milestones (authorization_id);
create index milestones_paypal_order_id_idx on public.milestones (paypal_order_id);

insert into private.schema_migrations (name) values ('20261112000000_payments.sql')
on conflict do nothing;
