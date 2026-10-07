-- Sinkron Tetra Ops → Booth (kontrak tetra-ops/docs/INTEGRASI-TETRA-BOOTH.md v0.2, DECISIONS #173).
-- Kabar webhook yang sudah diterima: kunci idempotensi `X-Tetra-Delivery`. Organisasi = pemilik integrasi Ops
-- (env TETRA_OPS_ORG_ID). Hanya ditulis/dibaca service role; admin organisasi boleh membaca.
create table if not exists ops_webhook_deliveries (
  delivery_id uuid primary key,
  organization_id uuid not null references organizations(id),
  event text not null,
  project_id text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  payload jsonb not null
);
alter table ops_webhook_deliveries enable row level security;
create policy read on ops_webhook_deliveries for select
  using (is_member(organization_id, array['owner','admin']));

-- Tanda dari Ops pada event Booth yang diimpor dari booking itu (events.ops_project_id):
-- {"cancelled_at"?, "updated_at"?, "design_approved_at"?, "design"?}. Waktu = occurred_at dari Ops.
alter table events add column if not exists ops_sync jsonb not null default '{}';
create index if not exists events_ops_project on events (organization_id, ops_project_id)
  where ops_project_id is not null;

-- Ringkasan per event untuk portal Ops (GET /api/ops/events/:id): sesi & foto tanpa menarik semua baris.
-- security invoker: RLS sessions tetap berlaku untuk pemanggil.
create or replace function ops_event_stats(org uuid, evs uuid[])
returns table (event_id uuid, sessions bigint, photos bigint)
language sql stable security invoker
set search_path = public
as $$
  select s.event_id, count(*), coalesce(sum(s.photo_count), 0)
  from sessions s
  where s.organization_id = org and s.event_id = any(evs) and not s.is_test and s.deleted_at is null
  group by s.event_id
$$;
