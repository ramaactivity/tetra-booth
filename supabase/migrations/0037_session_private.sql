-- Tamu menyembunyikan fotonya sendiri dari galeri publik acara & layar TV live (audit 27 Nov). Galeri klien
-- (penyelenggara) dan halaman foto tamu itu sendiri tetap menampilkan. Beda dengan hidden_at (moderasi owner).
alter table sessions add column if not exists private_at timestamptz;
