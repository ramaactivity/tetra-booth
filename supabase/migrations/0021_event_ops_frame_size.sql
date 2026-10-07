-- Ukuran frame booking Tetra Ops (2R / 4R / polaroid) disimpan di event saat impor wizard (DECISIONS #162),
-- supaya peringatan "Tetra Ops mencatat ukuran …" muncul juga di Pengaturan. Kosong = event tidak dari Ops.
alter table events add column if not exists ops_frame_size text;
