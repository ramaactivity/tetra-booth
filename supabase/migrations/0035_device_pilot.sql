-- Rilis booth bertahap (audit 27 Nov): booth pilot menerima versi terbaru (dev-builds/latest.json) lebih dulu,
-- booth lain menerima dev-builds/general.json sampai owner menekan "Rilis ke semua booth".
alter table devices add column if not exists pilot boolean not null default false;
