-- Notifikasi WA owner lewat Hermes (audit 27 Nov): alert yang sudah diteruskan Hermes ke grup admin, supaya tidak
-- dikirim dua kali. Hanya service role (API /api/hermes/alerts); RLS aktif tanpa policy.
create table if not exists alert_acks (
  organization_id uuid not null references organizations(id) on delete cascade,
  id text not null,
  acked_at timestamptz not null default now(),
  primary key (organization_id, id)
);
alter table alert_acks enable row level security;
