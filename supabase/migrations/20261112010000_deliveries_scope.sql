-- Phase 5: deliveries (any file type we sniff ourselves), client messages, revision requests.
alter table public.change_requests
  add column kind text not null default 'suggestion'
    check (kind in ('suggestion', 'revision', 'message'));

-- Deliveries can be PDFs, SVGs and ZIPs too; the server validates types by magic bytes.
update storage.buckets set allowed_mime_types = null, file_size_limit = 20971520 where id = 'deal-inputs';

create index deliveries_milestone_id_idx on public.deliveries (milestone_id, round desc);

insert into private.schema_migrations (name) values ('20261112010000_deliveries_scope.sql')
on conflict do nothing;
