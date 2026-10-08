-- Pemeriksaan bukti promo tamu (#219): hasil AI saat klaim, bisa diubah Bruno (Hermes) atau owner.
-- `{verdict: ok|suspect|unchecked|rejected, reason, by: ai|bruno|owner, at}`. Aditif.
alter table leads add column if not exists proof_check jsonb;
