# 06 — Data Model

## 1. Postgres (Supabase)

Semua tabel punya `organization_id` + RLS. Waktu disimpan `timestamptz` (UTC), ditampilkan WIB.

```sql
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','admin','crew')),
  crew_pin_hash text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  short_code text not null,              -- ID pendek tampilan, mis. "5ED"
  token_hash text,                       -- sha256(device token)
  pairing_code text,                     -- 6 digit, sekali pakai
  pairing_expires_at timestamptz,
  app_version text,
  screen_width int, screen_height int,
  last_seen_at timestamptz,
  status jsonb not null default '{}',    -- heartbeat terakhir
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table layouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  paper text not null check (paper in ('4R','2x6x2')),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table layout_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  layout_id uuid not null references layouts(id),
  version int not null,
  spec jsonb not null,                   -- LayoutSpec (TSD §6)
  preview_key text,
  created_at timestamptz not null default now(),
  unique (layout_id, version)
);

create table events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  mode text not null check (mode in ('event','photobox')),
  event_date date not null,
  location text,
  orientation text not null default 'landscape' check (orientation in ('landscape','portrait')),
  status text not null default 'draft' check (status in ('draft','ready','live','completed','archived')),
  settings jsonb not null default '{}',  -- countdown, shot_delay, retake_max, max_prints, session_timer_sec, qr_screen_sec
  branding jsonb not null default '{}',  -- logo_key, color, cover_key, attract_key, attract_text
  lead_capture jsonb not null default '{"enabled":false}', -- fields, mode gate|optional, consent_text, consent_version
  public_gallery boolean not null default false,
  client_token text unique,
  live_token text unique,
  guest_expires_at timestamptz,          -- event_date + 30 hari
  client_expires_at timestamptz,         -- event_date + 90 hari (null untuk photobox)
  purge_at timestamptz,                  -- = client_expires_at ?? guest_expires_at
  purged_at timestamptz,
  bundle_version int not null default 1, -- naik setiap config/aset berubah
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table event_devices (
  organization_id uuid not null references organizations(id),
  event_id uuid not null references events(id) on delete cascade,
  device_id uuid not null references devices(id),
  primary key (event_id, device_id)
);

create table event_layouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  event_id uuid not null references events(id) on delete cascade,
  layout_version_id uuid not null references layout_versions(id),
  price_idr int,                         -- photobox: termasuk 1 lembar
  extra_print_price_idr int,             -- photobox
  sort int not null default 0
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  event_id uuid not null references events(id),
  device_id uuid not null references devices(id),
  event_layout_id uuid not null references event_layouts(id),
  prints int not null,
  amount_idr int not null,
  provider text not null default 'xendit',
  provider_ref text unique,
  qr_string text,
  status text not null check (status in ('pending','paid','expired','failed')),
  expires_at timestamptz not null,
  paid_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now()
);

create table sessions (
  id text primary key,                   -- nanoid 10 dari booth
  organization_id uuid not null references organizations(id),
  event_id uuid not null references events(id) on delete cascade,
  device_id uuid not null references devices(id),
  layout_version_id uuid references layout_versions(id),
  payment_id uuid references payments(id),
  started_at timestamptz not null,
  completed_at timestamptz,
  photo_count int not null default 0,
  retake_count int not null default 0,
  print_count int not null default 0,
  upload_status text not null default 'pending' check (upload_status in ('pending','partial','complete')),
  hidden_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on sessions (event_id, started_at);

create table assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  session_id text not null references sessions(id) on delete cascade,
  kind text not null check (kind in ('strip','strip_web','original','thumb_strip','thumb_original','animation')),
  idx int not null default 0,
  r2_key text not null unique,
  width int, height int, bytes int,
  created_at timestamptz not null default now()
);

create table favorites (
  organization_id uuid not null references organizations(id),
  event_id uuid not null references events(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, asset_id)
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  event_id uuid not null references events(id) on delete cascade,
  session_id text references sessions(id),
  data jsonb not null,
  consent_version text not null,
  consent_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table analytics_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references organizations(id),
  event_id uuid not null references events(id) on delete cascade,
  session_id text,
  type text not null check (type in ('qr_open','save','save_all','zip','gallery_open','live_view')),
  meta jsonb,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references organizations(id),
  actor_user_id uuid references auth.users(id),
  action text not null,                  -- session.hide, session.delete, event.delete, device.revoke, client_token.rotate, lead.export ...
  target text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- Fase 5
-- create extension vector;
-- create table face_embeddings (
--   id uuid primary key default gen_random_uuid(),
--   organization_id uuid not null, event_id uuid not null references events(id) on delete cascade,
--   session_id text not null references sessions(id) on delete cascade,
--   asset_id uuid not null references assets(id) on delete cascade,
--   embedding vector(512) not null
-- );
```

### RLS

```sql
create function is_member(org uuid, roles text[] default array['owner','admin','crew'])
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from members
    where organization_id = org and user_id = auth.uid() and active and role = any(roles)
  );
$$;

-- pola untuk setiap tabel:
alter table events enable row level security;
create policy read on events for select using (is_member(organization_id));
create policy write on events for all using (is_member(organization_id, array['owner','admin']))
  with check (is_member(organization_id, array['owner','admin']));
```
- Crew: `select` hanya event yang ditugaskan ke device mana pun di organisasinya (disempurnakan di Fase 3).
- Endpoint booth, tamu, klien, webhook, cron memakai service role **setelah** verifikasi token masing-masing, dan selalu memfilter `organization_id` secara eksplisit.

## 2. Struktur key R2

```
{orgId}/{eventId}/branding/{file}
{orgId}/{eventId}/sessions/{sessionId}/strip.jpg
{orgId}/{eventId}/sessions/{sessionId}/strip_web.jpg
{orgId}/{eventId}/sessions/{sessionId}/original_{n}.jpg
{orgId}/{eventId}/sessions/{sessionId}/thumb_strip.jpg
{orgId}/{eventId}/sessions/{sessionId}/thumb_original_{n}.jpg
{orgId}/layouts/{layoutId}/v{version}/{file}      # overlay, font, preview
```
Hapus event = hapus prefix `{orgId}/{eventId}/`.

## 3. SQLite lokal (booth)

```sql
create table kv (key text primary key, value text);          -- device_id, paper_remaining, active_event_id, crew_pin_hash
create table events_cache (
  id text primary key, bundle_version int, config json, synced_at text
);
create table sessions (
  id text primary key, event_id text, layout_version_id text,
  payment_id text, status text,                                -- in_progress|completed|abandoned
  started_at text, completed_at text,
  photo_count int, retake_count int, print_count int,
  synced_meta int default 0
);
create table assets (
  id text primary key, session_id text, kind text, idx int,
  path text, r2_key text, bytes int, uploaded_at text
);
create table upload_queue (
  asset_id text primary key, priority int, attempts int default 0,
  next_attempt_at text, last_error text
);
create table print_jobs (
  id text primary key, session_id text, path text, copies int,
  paper text, status text, attempts int default 0, error text, created_at text
);
```
- Mode WAL. Device token tidak disimpan di SQLite; memakai Electron `safeStorage`.
