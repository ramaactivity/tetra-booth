-- Fase 2 (N4): jumlah aset yang akan diunggah booth per sesi; upload_status = complete saat semua tercatat.
alter table sessions add column asset_count int;
