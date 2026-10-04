-- Slug event tanpa tahun dobel + unik global (DECISIONS #147).
-- "Employee Day DSO 2026" + 2026-10-04 → employee-day-dso-2026-10-04 (dulu employee-day-dso-2026-2026-10-04):
-- tahun di akhir nama yang sama dengan tahun tanggal event dibuang. Slug kini juga link publik galeri/live
-- (/g/<slug>, /live/<slug>), jadi harus unik di SEMUA organisasi, bukan per organisasi.

create or replace function event_slug_base(name text, d date) returns text language sql immutable as $$
  select coalesce(
    nullif(trim(both '-' from left(
      regexp_replace(
        regexp_replace(lower(regexp_replace(normalize(name, NFD), '[' || chr(768) || '-' || chr(879) || ']', '', 'g')), '[^a-z0-9]+', '-', 'g'),
        '-' || to_char(d, 'YYYY') || '-*$', ''),
      60)), ''),
    'event') || '-' || to_char(d, 'YYYY-MM-DD');
$$;

-- Slug ulang semua event (link slug lama mati; URL UUID tetap jalan). Urutan dibuat → yang pertama tanpa akhiran.
-- Dua langkah supaya index unik lama tidak bentrok di tengah update.
alter table events disable trigger events_updated_at;
update events set slug = 'tmp-' || id;
update events e set slug = case when s.n = 1 then s.base else s.base || '-' || s.n end
from (
  select id, event_slug_base(name, event_date) as base,
    row_number() over (partition by event_slug_base(name, event_date) order by created_at, id) as n
  from events
) s
where s.id = e.id;
alter table events enable trigger events_updated_at;

create unique index events_slug on events (slug);

-- security definer: cek bentrok harus melihat event organisasi lain (RLS menyembunyikannya dari pemanggil).
create or replace function events_set_slug() returns trigger language plpgsql
security definer set search_path = public as $$
declare
  base text;
  cand text;
  n int := 1;
begin
  if tg_op = 'INSERT' and new.slug <> '' then return new; end if;
  if tg_op = 'UPDATE' and new.name = old.name and new.event_date = old.event_date then return new; end if;
  base := event_slug_base(new.name, new.event_date);
  cand := base;
  -- ponytail: cek-lalu-tulis; dua insert serentak bernama sama bisa kena unique index (insert gagal, ulangi).
  while exists (select 1 from events where slug = cand and id <> new.id) loop
    n := n + 1;
    cand := base || '-' || n;
  end loop;
  new.slug := cand;
  return new;
end;
$$;
