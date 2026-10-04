-- Ukuran file event (DECISIONS #166). Laptop: isi "Buka Folder Event" booth (sesi asli; foto kamera resolusi
-- penuh, lembar cetak, GIF, video) dilaporkan booth saat Hentikan Acara / rekap booth dibuka; nilai terakhir menang.
-- null = belum dilaporkan. Cloud: jumlah assets.bytes sesi asli (original 2400px, strip_web, thumb, animasi, video).
alter table events add column if not exists local_bytes bigint;
alter table events add column if not exists local_files int;
alter table events add column if not exists local_reported_at timestamptz;

-- security invoker: RLS assets/sessions tetap berlaku untuk pemanggil.
create or replace function event_cloud_storage(org uuid, ev uuid)
returns table (bytes bigint, files bigint)
language sql stable security invoker
set search_path = public
as $$
  select coalesce(sum(a.bytes), 0)::bigint, count(*)
  from assets a join sessions s on s.id = a.session_id
  where a.organization_id = org and s.event_id = ev and not s.is_test and s.deleted_at is null
$$;
