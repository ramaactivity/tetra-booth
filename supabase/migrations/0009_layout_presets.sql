-- Tata letak tersimpan milik organisasi (editor → "Tata letak cepat" → "Tata letak saya").
-- Hanya posisi slot foto untuk satu kanvas (format + orientasi); teks/overlay/aset tidak ikut.
create table layout_presets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  paper text not null check (paper in ('4R','2x6x2','3x4x2')),
  width int not null,
  height int not null,
  slots jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index layout_presets_org_created on layout_presets (organization_id, created_at desc);

alter table layout_presets enable row level security;
create policy read on layout_presets for select using (is_member(organization_id));
create policy write on layout_presets for all
  using (is_member(organization_id, array['owner','admin']))
  with check (is_member(organization_id, array['owner','admin']));
