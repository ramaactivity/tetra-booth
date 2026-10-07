-- Guest Cam (#197, docs/PLAN-GUEST-CAM.md): tamu memotret dari HP lewat /c/<slug>. Satu tamu = satu sesi
-- `source='guest'` tanpa device; browser tamu diikat ke sesinya lewat hash kunci di cookie. Aditif.
alter table sessions drop constraint if exists sessions_source_check;
alter table sessions add constraint sessions_source_check check (source in ('booth', 'stage', 'guest'));
alter table sessions alter column device_id drop not null;
alter table sessions add constraint sessions_device_required check (device_id is not null or source = 'guest');
alter table sessions add column if not exists guest_key_hash text;
create unique index if not exists sessions_guest_key on sessions (event_id, guest_key_hash)
  where guest_key_hash is not null;

-- Ucapan suara tamu (maks 30 dtk).
alter table assets drop constraint if exists assets_kind_check;
alter table assets add constraint assets_kind_check
  check (kind in ('strip','strip_web','original','thumb_strip','thumb_original','animation','video','audio'));
-- Moderasi per event: null = tampil, pending = menunggu disetujui, rejected = ditolak. hidden_at tetap untuk sembunyi manual.
alter table assets add column if not exists review_status text check (review_status in ('pending', 'rejected'));

-- Link QR Guest Cam: terisi = aktif (pola live_token, #147). Reveal "setelah acara" dibuka saat kolom ini terisi.
alter table events add column if not exists guest_token text unique;
alter table events add column if not exists guest_revealed_at timestamptz;

