# Rencana Fase 2: Cloud + halaman tamu

Status: **draf (2026-09-24), belum dikerjakan.** Mulai setelah kriteria Fase 1 terbukti (W-020 stress 500 sesi di Windows lulus). Keputusan di bawah diambil Claude Mac atas delegasi Rama ("decide sendiri") dan dicatat di DECISIONS saat dikerjakan; Rama bisa mengubahnya kapan saja.

Target selesai (07-ROADMAP): di event nyata ≥ 95% sesi ter-upload ≤ 5 menit saat online; internet dicabut 1 jam lalu disambung → semua sesi terkirim tanpa campur tangan.

## Masalah urutan roadmap

Pairing device (FSD §1.2) dan membuat event dilakukan dari **admin**, padahal admin baru Fase 3. Solusi Fase 2: dua **skrip server** yang dijalankan owner dari laptopnya (service role hanya di mesin itu, tidak di booth):
- `pnpm --filter @tetra/db device:add "<nama booth>"` → buat baris `devices` + kode pairing 6 digit (10 menit).
- `pnpm --filter @tetra/db event:push <folder-bundle> --device <short_code>` → unggah bundle lokal (format `EventBundleSchema` yang sama dengan Fase 1) ke `events` + R2, tugaskan ke device.
Di Fase 3 keduanya diganti tombol di admin; endpoint booth tidak berubah.

## Milestone

| # | Isi | Mesin | Uji selesai |
|---|---|---|---|
| N1 | **Fondasi API booth**: kontrak zod di `packages/shared` (pair, events, bundle, sessions, sign, assets, heartbeat); auth `Bearer {deviceToken}` → `sha256` → `devices` (bukan revoked) di setiap route `app/api/booth/*`; semua query service role **dengan filter `organization_id` eksplisit**; respons error berkode. Rate limit endpoint publik lewat fungsi Postgres `rate_hit(key, window, max)` (tanpa infrastruktur tambahan). | Mac | Vitest route handler + uji RLS/rate-limit di embedded Postgres |
| N2 | **Pairing**: skrip `device:add`; `POST /api/booth/pair` (kode sekali pakai, kedaluwarsa 10 menit, balas token 40 byte base64url, simpan sha256). Booth: layar pairing saat belum dipasangkan (FSD §1.1–1.2) + menu crew "Pasangkan ulang"; token di Electron `safeStorage`, bukan SQLite. | Mac, Windows verifikasi | E2E: kode → token → heartbeat 200; token dicabut → 401 |
| N3 | **Pull event + bundle**: skrip `event:push`; `GET /api/booth/events` (bundleVersion), `GET /api/booth/events/{id}/bundle` (manifest: config + aset + sha256 + URL GET R2 bertanda tangan 15 menit). Booth: unduh aset yang hash-nya beda ke folder sementara → rename atomik ke `events/{id}/bundle`; event aktif tidak diganti di tengah sesi; tombol crew "Sync event". | Mac | Bundle berubah → booth menarik versi baru tanpa restart; offline → pakai cache |
| N4 | **Antrean upload** (TSD §4.2) di Electron main: `POST /sessions` (upsert idempotent per ID), `POST /uploads/sign` (batch presigned PUT R2 15 menit, key `{org}/{event}/sessions/{id}/…`), PUT file, `POST /sessions/{id}/assets` → `upload_status` pending/partial/complete. Konkurensi 2, prioritas 0/1/2 (sudah di `upload_queue`), backoff 5 s/15 s/1 m/5 m, cek online tiap 15 s, tidak pernah memblokir UI. Status di menu crew. | Mac, Windows verifikasi | Vitest worker (server palsu); uji cabut internet 1 jam |
| N5 | **Heartbeat** tiap 60 s saat online (versi, event aktif, kamera, printer, kertas, antrean, error terakhir) → `devices.status`, `last_seen_at`. | Mac | Kolom terisi; online < 2 menit |
| N6 | **Halaman tamu `/s/{id}`** sesuai desain v2 B01–B03 (`docs/design/v2`): state `unknown` (refresh 15 s), `pending` (aset yang ada langsung tampil, refresh 5 s), `ready`, `expired`, `removed`; branding event; tombol **Simpan** via Web Share API dengan file (fallback unduh), **Simpan semua**; "Tersedia sampai {tanggal}"; `noindex`; target LCP ≤ 2 s di 4G (server component, gambar dari CDN R2, ukuran `strip_web`/`thumb`). Lead capture (B04) & galeri publik tetap Fase 5. | Mac | Playwright mobile 390 px untuk tiap state; Lighthouse LCP |
| N7 | **Tracking** `qr_open`, `save`, `save_all` → `POST /api/track` (rate-limited) → `analytics_events`. | Mac | Baris masuk dengan `organization_id` & `event_id` benar |
| N8 | **Sentry** web + booth (main & renderer), tanpa data pribadi tamu. | Mac | Error uji muncul di Sentry |
| N9 | **Uji ketahanan**: booth di laptop Rama, internet dicabut 1 jam saat 30+ sesi, lalu disambung; ukur % sesi ter-upload ≤ 5 menit. Juga lewat tethering HP/4G. | **Windows** | Kriteria selesai Fase 2 |

Urutan: N1 → N2 → N3 → N4 → N5 (booth sudah bisa kirim) → N6 → N7 → N8 → N9.

## Yang dibutuhkan dari Rama (sebelum N6/N8)

1. **Vercel**: project untuk `apps/web` (Rama login `vercel` sekali, atau hubungkan repo GitHub di dashboard Vercel) + env (Supabase, R2) di Vercel.
2. **DNS di Hostinger**: `CNAME app → cname.vercel-dns.com` untuk `app.tetraphoto.com` (URL QR). Sampai itu ada, QR memakai URL preview Vercel.
3. **Sentry**: akun/organisasi + dua DSN (web, booth). Tier gratis cukup.
4. Keputusan domain media: tetap `r2.dev` (sekarang) atau pindah DNS ke Cloudflare supaya `media.tetraphoto.com` (DECISIONS #8).

## Di luar Fase 2

Admin, galeri klien, live slideshow, worker ZIP, cron retensi (Fase 3); photobox/QRIS (Fase 4); animasi, lead capture, galeri publik, Temukan Foto Saya (Fase 5).
