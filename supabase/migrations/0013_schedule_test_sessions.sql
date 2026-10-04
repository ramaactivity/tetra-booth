-- Jadwal event + sesi tes booth (DECISIONS #152–#154).
-- scheduled_start/scheduled_end: jam mulai/selesai menurut booking (Tetra Ops atau diisi manual), waktu lokal venue.
--   Hanya referensi untuk rekap ("Jadwal vs Nyata"), tidak pernah membatasi booth.
-- sessions.is_test: sesi yang diambil crew di mode "Tes dulu" (booth). Tidak dihitung di statistik, rekap, galeri
--   klien, slideshow, dan galeri booth; tetap terlihat admin dengan tanda "Tes".
alter table events add column if not exists scheduled_start time;
alter table events add column if not exists scheduled_end time;
alter table sessions add column if not exists is_test boolean not null default false;
