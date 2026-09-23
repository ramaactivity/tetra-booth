-- Tetra Booth: skema awal. Sumber: docs/06-DATA-MODEL.md §1.
-- Semua tabel punya organization_id + RLS. Waktu timestamptz (UTC).

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
  short_code text not null,
  token_hash text,
  pairing_code text,
  pairing_expires_at timestamptz,
  app_version text,
  screen_width int,
  screen_height int,
  last_seen_at timestamptz,
  status jsonb not null default '{}',
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
  spec jsonb not null,
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
  settings jsonb not null default '{}',
  branding jsonb not null default '{}',
  lead_capture jsonb not null default '{"enabled":false}',
  public_gallery boolean not null default false,
  client_token text unique,
  live_token text unique,
  guest_expires_at timestamptz,
  client_expires_at timestamptz,
  purge_at timestamptz,
  purged_at timestamptz,
  bundle_version int not null default 1,
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
  price_idr int,
  extra_print_price_idr int,
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
  id text primary key,
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
  width int,
  height int,
  bytes int,
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
  action text not null,
  target text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- updated_at otomatis untuk events
create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger events_updated_at before update on events
  for each row execute function set_updated_at();

-- RLS ----------------------------------------------------------------------

create function is_member(org uuid, roles text[] default array['owner','admin','crew'])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members
    where organization_id = org and user_id = auth.uid() and active and role = any(roles)
  );
$$;

-- organizations: baca oleh anggota, tulis hanya owner
alter table organizations enable row level security;
create policy read on organizations for select using (is_member(id));
create policy write on organizations for all
  using (is_member(id, array['owner'])) with check (is_member(id, array['owner']));

-- members: baca oleh anggota, tulis hanya owner (FSD §5.1 Tim)
alter table members enable row level security;
create policy read on members for select using (is_member(organization_id));
create policy write on members for all
  using (is_member(organization_id, array['owner']))
  with check (is_member(organization_id, array['owner']));

-- pola umum: baca semua anggota, tulis owner/admin
do $$
declare t text;
begin
  foreach t in array array[
    'devices','layouts','layout_versions','events','event_devices','event_layouts',
    'payments','sessions','assets','favorites','leads','analytics_events','audit_logs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy read on %I for select using (is_member(organization_id))', t);
    execute format(
      'create policy write on %I for all using (is_member(organization_id, array[''owner'',''admin''])) '
      || 'with check (is_member(organization_id, array[''owner'',''admin'']))', t);
  end loop;
end $$;
