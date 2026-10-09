-- Kartu promosi halaman tamu (#215): sosial media org + IG klien, lead "tertarik pakai" untuk sales (Hermes),
-- dan kode promo yang diklaim dengan bukti (tag IG / review Google). Aditif.

-- Pengaturan per organisasi (B2B: tiap vendor mengisi akunnya sendiri; kosong = kartu tidak tampil).
alter table organizations add column if not exists promo jsonb not null default '{}';

-- IG klien (pengantin, perusahaan, WO/EO) tampil di samping IG org; prefill dari Ops `client_instagram`.
alter table events add column if not exists client_instagram text[] not null default '{}';
-- Matikan kartu promosi untuk event ini (mis. klien korporat tidak mau ada promosi di galerinya).
alter table events add column if not exists promo_off boolean not null default false;

-- leads: `event` = lead capture milik event (#71, data untuk klien); `sales` = tamu tertarik memakai jasa org.
-- Hermes hanya menarik `sales`.
alter table leads add column if not exists kind text not null default 'event' check (kind in ('event', 'sales'));
alter table leads add column if not exists proof_kind text check (proof_kind in ('instagram', 'review'));
alter table leads add column if not exists proof_key text;
alter table leads add column if not exists promo_code text unique;
alter table leads add column if not exists contact_status text not null default 'new'
  check (contact_status in ('new', 'queued', 'sent', 'replied', 'converted', 'opted_out'));
alter table leads add column if not exists contacted_at timestamptz;
-- Satu nomor = satu lead sales per org (isi ulang dari event lain mengembalikan lead yang sama).
create unique index if not exists leads_sales_phone on leads (organization_id, (data ->> 'whatsapp'))
  where kind = 'sales';
create index if not exists leads_sales_recent on leads (organization_id, created_at) where kind = 'sales';
