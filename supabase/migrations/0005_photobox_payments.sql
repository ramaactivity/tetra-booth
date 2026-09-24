-- Fase 4 (DECISIONS #70): layout & harga photobox disimpan di events.settings.photobox (server menghitung harga dari
-- situ), bukan event_layouts (dipakai editor template penuh nanti). Pembayaran: paket (1 lembar termasuk) dan
-- tambahan cetak setelah foto (desain A7b/E6), keduanya terikat ke sesi booth.
alter table payments alter column event_layout_id drop not null;
alter table payments add column layout_key text;
alter table payments add column kind text not null default 'package' check (kind in ('package','extra_prints'));
alter table payments add column session_id text;
create index payments_org_created on payments (organization_id, created_at desc);
