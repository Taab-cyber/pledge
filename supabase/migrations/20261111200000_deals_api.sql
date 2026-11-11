-- Phase 3: deal inputs, plan metadata, and atomic plan/share/approve functions.
-- The functions are SECURITY INVOKER and callable only by service_role: services authorize first.

alter table public.deals
  add column source_text text check (char_length(source_text) <= 20000),
  add column source_files jsonb not null default '[]'::jsonb,
  add column plan_meta jsonb;

-- Due date is fixed only once a milestone is secured; until then the plan holds a duration.
alter table public.milestones
  add column due_in_days int check (due_in_days between 1 and 21);

-- Private bucket for chat screenshots and (Phase 5) deliveries. Server access only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deal-inputs', 'deal-inputs', false, 20971520, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Replaces the draft plan (milestones + to-dos) in one transaction.
-- p_milestones: [{ title, amount_minor, due_in_days, revisions_included, todos: [text] }]
create or replace function public.replace_plan(p_deal_id uuid, p_title text, p_plan_meta jsonb, p_milestones jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  d public.deals;
  m jsonb;
  m_id uuid;
  pos int := 0;
  t text;
  t_pos int;
begin
  select * into d from public.deals where id = p_deal_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if d.status not in ('draft', 'shared') then raise exception 'PLAN_NOT_EDITABLE' using errcode = 'P0001'; end if;

  delete from public.milestones where deal_id = p_deal_id;
  for m in select * from jsonb_array_elements(p_milestones) loop
    insert into public.milestones (deal_id, kind, position, title, amount_minor, due_in_days, revisions_included)
    values (p_deal_id, 'milestone', pos, m->>'title', (m->>'amount_minor')::bigint,
            (m->>'due_in_days')::int, (m->>'revisions_included')::int)
    returning id into m_id;
    t_pos := 0;
    for t in select jsonb_array_elements_text(m->'todos') loop
      insert into public.todos (milestone_id, position, label) values (m_id, t_pos, t);
      t_pos := t_pos + 1;
    end loop;
    pos := pos + 1;
  end loop;

  -- Editing a shared plan takes it back to draft: the client can't approve until it is re-shared.
  update public.deals
     set title = coalesce(p_title, title),
         plan_meta = coalesce(p_plan_meta, plan_meta),
         status = 'draft'
   where id = p_deal_id;

  insert into public.events (deal_id, actor_role, type, payload)
  values (p_deal_id, 'freelancer', 'plan_saved', jsonb_build_object('milestones', pos, 'was', d.status));
end $$;

-- Snapshots the current plan as a new immutable version, rotates the share token hash, status → shared.
create or replace function public.share_deal(p_deal_id uuid, p_token_hash text)
returns int language plpgsql set search_path = '' as $$
declare
  d public.deals;
  v int;
  snap jsonb;
  total bigint;
begin
  select * into d from public.deals where id = p_deal_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if d.status not in ('draft', 'shared') then raise exception 'PLAN_NOT_EDITABLE' using errcode = 'P0001'; end if;

  select coalesce(sum(amount_minor), 0) into total from public.milestones where deal_id = p_deal_id and kind = 'milestone';
  if total <> d.total_minor or total = 0 then raise exception 'PLAN_INVALID' using errcode = 'P0001'; end if;

  select jsonb_build_object(
    'title', d.title,
    'currency', d.currency,
    'total_minor', d.total_minor,
    'auto_release_hours', d.auto_release_hours,
    'summary', d.plan_meta->>'summary',
    'milestones', coalesce(jsonb_agg(jsonb_build_object(
        'position', m.position,
        'title', m.title,
        'amount_minor', m.amount_minor,
        'due_in_days', m.due_in_days,
        'revisions_included', m.revisions_included,
        'todos', (select coalesce(jsonb_agg(t.label order by t.position), '[]'::jsonb)
                    from public.todos t where t.milestone_id = m.id)
      ) order by m.position), '[]'::jsonb)
  ) into snap
  from public.milestones m where m.deal_id = p_deal_id and m.kind = 'milestone';

  v := d.current_version + 1;
  insert into public.deal_versions (deal_id, version, snapshot) values (p_deal_id, v, snap);
  update public.deals set current_version = v, status = 'shared', share_token_hash = p_token_hash where id = p_deal_id;
  insert into public.events (deal_id, actor_role, type, payload)
  values (p_deal_id, 'freelancer', 'plan_shared', jsonb_build_object('version', v));
  return v;
end $$;

-- Client approves the exact shared version: consent recorded, deal approved, first milestone open for a hold.
create or replace function public.approve_deal(
  p_deal_id uuid, p_client_id uuid, p_version int, p_text text, p_text_sha256 text, p_user_agent text
) returns void language plpgsql set search_path = '' as $$
declare
  d public.deals;
begin
  select * into d from public.deals where id = p_deal_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if d.freelancer_id = p_client_id then raise exception 'SAME_USER' using errcode = 'P0001'; end if;
  if d.client_id is not null and d.client_id <> p_client_id then raise exception 'DEAL_TAKEN' using errcode = 'P0001'; end if;
  if d.status = 'draft' and d.current_version > 0 then raise exception 'PLAN_BEING_EDITED' using errcode = 'P0001'; end if;
  if d.status <> 'shared' then raise exception 'DEAL_NOT_SHARED' using errcode = 'P0001'; end if;
  if d.current_version <> p_version then raise exception 'PLAN_VERSION_CHANGED' using errcode = 'P0001'; end if;

  insert into public.consents (deal_id, deal_version, client_id, text, text_sha256, user_agent)
  values (p_deal_id, p_version, p_client_id, p_text, p_text_sha256, left(p_user_agent, 500));

  update public.deals set client_id = p_client_id, status = 'approved' where id = p_deal_id;

  update public.milestones set status = 'awaiting_hold'
   where id = (select id from public.milestones
                where deal_id = p_deal_id and kind = 'milestone' and status = 'draft'
                order by position limit 1);

  insert into public.events (deal_id, actor_role, type, payload)
  values (p_deal_id, 'client', 'plan_approved', jsonb_build_object('version', p_version, 'consent_sha256', p_text_sha256));
end $$;

revoke execute on function public.replace_plan(uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.share_deal(uuid, text) from public, anon, authenticated;
revoke execute on function public.approve_deal(uuid, uuid, int, text, text, text) from public, anon, authenticated;
grant execute on function public.replace_plan(uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.share_deal(uuid, text) to service_role;
grant execute on function public.approve_deal(uuid, uuid, int, text, text, text) to service_role;
