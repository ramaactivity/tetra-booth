-- Kode promo tamu dipakai di booking Tetra Ops (#218): nilai diskon dibekukan saat kode terbit, masa berlaku,
-- ditolak admin (bukti palsu), dan sekali pakai per booking. Aditif.
alter table leads add column if not exists promo jsonb;
alter table leads add column if not exists promo_expires_at timestamptz;
alter table leads add column if not exists promo_rejected_at timestamptz;
alter table leads add column if not exists redeemed_at timestamptz;
alter table leads add column if not exists redeemed_project_id text;
