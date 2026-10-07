-- Photo Stage (#195): foto per aset bisa disembunyikan dari halaman tamu, galeri, live, ZIP, dan Ops (riwayat laptop
-- stage: Sembunyikan, Pisah, Gabung). Disetel lewat upsert sesi (`hiddenIdx`); kosong = tampil.
alter table assets add column if not exists hidden_at timestamptz;

create or replace function ops_event_stats(org uuid, evs uuid[])
returns table (event_id uuid, sessions bigint, photos bigint)
language sql stable security invoker
set search_path = public
as $$
  select s.event_id, count(*),
    coalesce(sum(s.photo_count), 0) - coalesce(sum((
      select count(*) from assets a
      where a.session_id = s.id and a.kind = 'original' and a.hidden_at is not null
    )), 0)
  from sessions s
  where s.organization_id = org and s.event_id = any(evs) and not s.is_test and s.deleted_at is null
  group by s.event_id
$$;
