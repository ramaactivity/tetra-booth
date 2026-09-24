# Rencana Fase 3: Admin + klien + live

Status: **dikerjakan sejak 2026-09-25**, paralel dengan penutupan Fase 2 (kriteria Fase 2 & 1b butuh event nyata; DECISIONS #65). Keputusan diambil Claude Mac atas delegasi Rama dan dicatat di DECISIONS.

Target selesai (07-ROADMAP): satu event disiapkan 100% dari admin tanpa menyentuh file lokal, dan klien sungguhan menerima & memakai galerinya.

## Arsitektur
- Admin `/admin/*`: Next.js server components + Server Actions dengan klien Supabase **milik user** (`@supabase/ssr`, cookie), jadi RLS berlaku (TSD §7). Service role hanya untuk operasi yang memang lintas-RLS (R2, token publik, pairing).
- `proxy.ts` menyegarkan sesi Supabase untuk `/admin`. Login email + kata sandi (desain E0), atur ulang lewat email Supabase.
- Desain: v2 E0–E8, C1–C4, D1 (`docs/design/v2`).

## Milestone
| # | Isi | Uji |
|---|---|---|
| A1 | Login/keluar/atur ulang, layout admin (sidebar E1), guard anggota organisasi | Playwright: user uji login → /admin; non-anggota ditolak |
| A2 | **Device** (E5): kartu status dari heartbeat, "Tambah Booth" → kode pairing, kode baru, cabut | e2e: tambah → kode → pair API → online |
| A3 | **Event**: daftar (E1), buat, pengaturan (E3: info, pengalaman, masa berlaku), tugaskan device | e2e buat event → tampil di booth lewat API |
| A4 | **Template sederhana** (bagian E4): pilih layout preset + unggah overlay PNG + teks → bundle event (menggantikan skrip `event:push`) | bundle v+1, booth sync |
| A5 | **Dashboard event** (E2): statistik, funnel QR, sesi terbaru, moderasi sembunyikan/hapus + audit log (E8) | e2e |
| A6 | **Link klien**: buat/salin/buat ulang/cabut token klien & live | e2e |
| A7 | **Galeri klien** `/g/{token}` (C1–C2): grid per jam, lightbox, unduh, favorit | Playwright mobile + desktop |
| A8 | **Live slideshow** `/live/{token}` (D1): foto terbaru bergantian, polling | e2e |
| A9 | Cron retensi (`purge_at`) + ZIP semua foto (C3) | uji route |

Di luar urutan ini (menyusul): editor template drag-and-drop penuh, tim & undangan (E7), transaksi (E6, Fase 4).
