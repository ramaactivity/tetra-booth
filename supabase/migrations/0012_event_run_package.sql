-- Rekap event + timer jalannya event + paket (DECISIONS #148–#150).
-- run: {"segments":[{"start":ISO,"end":ISO?}],"finishedAt":ISO?,"ids":[id aksi booth terakhir]} — data saja,
--   tidak membatasi booth. Diubah admin (server action) dan booth (POST /api/booth/events/:id/run, idempotent).
-- package_name/package_hours: paket yang dijual (dari Tetra Ops atau diisi manual) untuk membandingkan durasi.
-- ops_project_id: project_id booking Tetra Ops asal event (impor wizard), hanya referensi.
alter table events add column if not exists run jsonb not null default '{"segments":[]}';
alter table events add column if not exists package_name text;
alter table events add column if not exists package_hours numeric(4,1)
  check (package_hours is null or (package_hours > 0 and package_hours <= 48));
alter table events add column if not exists ops_project_id text;
