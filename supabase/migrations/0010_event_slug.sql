-- URL admin event yang terbaca: /admin/events/<slug>, mis. employee-day-dso-2026-10-04 (DECISIONS #146).
-- Slug = nama (ASCII, huruf kecil, aksen dibuang, selain huruf/angka → '-', maks 60) + '-' + tanggal event;
-- unik per organisasi (bentrok → -2, -3, …). Diisi trigger saat insert dan saat nama/tanggal berubah,
-- jadi semua jalur insert (wizard, skrip, test) otomatis dapat slug. UUID tetap diterima di URL admin.

create function event_slug_base(name text, d date) returns text language sql immutable as $$
  select coalesce(
    nullif(trim(both '-' from left(
      regexp_replace(lower(regexp_replace(normalize(name, NFD), '[' || chr(768) || '-' || chr(879) || ']', '', 'g')), '[^a-z0-9]+', '-', 'g'),
      60)), ''),
    'event') || '-' || to_char(d, 'YYYY-MM-DD');
$$;

alter table events add column slug text not null default '';

-- Backfill: event lama per (organisasi, slug dasar) diurutkan waktu dibuat → yang pertama tanpa akhiran.
-- Slug dasar selalu berakhir tanggal, jadi akhiran -2/-3 tidak bisa bertabrakan dengan slug dasar lain.
update events e set slug = case when s.n = 1 then s.base else s.base || '-' || s.n end
from (
  select id, event_slug_base(name, event_date) as base,
    row_number() over (
      partition by organization_id, event_slug_base(name, event_date) order by created_at, id
    ) as n
  from events
) s
where s.id = e.id;

create unique index events_org_slug on events (organization_id, slug);

create function events_set_slug() returns trigger language plpgsql as $$
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
  while exists (
    select 1 from events where organization_id = new.organization_id and slug = cand and id <> new.id
  ) loop
    n := n + 1;
    cand := base || '-' || n;
  end loop;
  new.slug := cand;
  return new;
end;
$$;
create trigger events_slug before insert or update on events
  for each row execute function events_set_slug();
