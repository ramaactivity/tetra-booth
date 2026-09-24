# 07 — Roadmap

Prinsip:
1. **Windows dimatangkan dulu.** Fase 1–5 seluruhnya di Windows. macOS, Android, iPad, dan Air Station baru dikerjakan setelah Gerbang Windows Matang tercapai.
2. **Fase 1 harus bisa menggantikan LumaBooth di event nyata tanpa cloud.**
3. Fase berikutnya tidak dimulai sebelum kriteria selesai fase sebelumnya terpenuhi.

## Paralel sejak hari pertama (non-coding)
- [ ] Daftar merchant Xendit (verifikasi butuh waktu).
- [ ] Download Canon EDSDK (daftar developer Canon).
- [ ] Siapkan laptop booth khusus test + 1 kamera + DNP + roll kertas test.
- [ ] Tentukan domain pendek.

---

## Fase 0 — Fondasi
- [x] Monorepo pnpm + Turborepo, lint, format, CI dasar.
- [x] `packages/shared`: tipe, skema zod, protokol Camera Service.
- [x] `packages/ui`: design tokens sesuai `08-DESIGN.md` (tema per event). _(2026-09-24: diganti token desain v2, DECISIONS #45; layar booth Fase 1 sudah v2)_
- [x] `packages/booth-core` + interface `BoothPlatform` + `packages/platform-electron` (hanya adapter Electron).
- [x] `packages/template-engine`: render 4R & 2x6x2 + test snapshot.
- [x] Supabase project dev: migrasi awal (semua tabel + RLS), seed organisasi Tetra. _(2026-09-24: `0001_init.sql` di-push ke project dev, owner tetrabooth.app@gmail.com di-seed, `/api/health` → `db:true`; RLS teruji: `pnpm --filter @tetra/db test`)_
- [x] Bucket R2 dev + custom domain media. _(2026-09-24: bucket `tetra-media-dev` + r2.dev publik, `pnpm --filter web r2:check` OK; custom domain ditunda, lihat DECISIONS #8)_
- [x] Skeleton `apps/booth`, `apps/web`, `services/camera` yang bisa jalan.

**Selesai jika:** template engine merender contoh layout identik di browser & Electron; `dotnet run` Camera Service menerima koneksi WebSocket dari booth. _(Terpenuhi 2026-09-23: hash `ae20f38c…` sama di Vitest, Playwright/Chromium, dan Electron; health check Electron → Camera Service OK.)_

## Fase 1 — Booth offline (mode event)
- [x] Kamera uji: webcam (renderer) + kamera simulasi; hot-folder fallback di Camera Service. _(M1 + M7, 2026-09-24; Canon EDSDK dipindah ke Fase 1b, DECISIONS #26)_
- [x] Camera Service: print lewat `WindowsPrinterAdapter` (4R & 2x6x2), status spooler. _(M4/W-009; cetak fisik DNP di Fase 1b)_
- [x] Supervisor & watchdog di Electron main. _(M3, 2026-09-24; verifikasi Windows W-013)_
- [x] Kiosk: auto-start, fullscreen, anti-sleep. _(M5, 2026-09-24: auto-start lewat toggle mode crew; verifikasi Windows W-016)_
- [x] State machine sesi: attract → countdown → capture → review/retake → compose → print select → printing → QR. _(M1, 2026-09-24)_
- [x] SQLite lokal, struktur folder sesi, output strip/original/thumb. _(M2, 2026-09-24; verifikasi Windows W-012)_
- [x] Mode crew: pilih event (dari file bundle lokal), cek kamera, test print, counter kertas, keluar kiosk. _(M6, 2026-09-24; keluar = tutup app sampai M5; verifikasi Windows W-014)_
- [x] Orientasi landscape & portrait. _(M1; diuji di jendela, uji layar booth asli menyusul)_
- [x] Logging lokal. _(M2: log harian, simpan 14 hari)_

**Selesai jika:**
1. Alur sesi lengkap berjalan di Windows dengan webcam, output tersimpan, print lewat `WindowsPrinterAdapter`.
2. Stress test otomatis 500 sesi (kamera simulasi) tanpa crash atau memory leak. _(Selesai 2026-09-25: W-024 500/500 sesi tanpa crash, tanpa tren memori; dinyatakan cukup oleh Rama, DECISIONS #53)_

## Fase 1b — Kamera DSLR (dipindah dari Fase 1, menunggu EDSDK & kamera)
- [ ] Camera Service: Canon EDSDK (connect, reconnect, live view, capture).
- [x] Cetak fisik DNP RX1HS 4R & 2x6x2. _(W-022/W-023, 2026-09-25: tanpa tepi putih, offset terkalibrasi `7.335,6.70`; potong 2 inci hanya lewat dialog Printing Preferences, DECISIONS #59. 60D lewat digiCamControl + hot folder sebagai pengganti sementara EDSDK)_

**Selesai jika:**
1. Stress test otomatis 500 sesi semalaman tanpa crash, memory leak, atau kamera putus permanen (diuji di 600D dan 70D).
2. Dipakai di 1 event nyata dengan LumaBooth standby sebagai cadangan, tanpa perlu pindah ke cadangan.

## Fase 2 — Cloud + halaman tamu
- [x] Pairing device. _(N2, 2026-09-25: API + skrip owner + mode crew; DECISIONS #55–56)_
- [x] Pull event + bundle, cache offline. _(N3, 2026-09-25; DECISIONS #57)_
- [x] Antrean upload + presigned R2 + retry backoff. _(N4, 2026-09-25; DECISIONS #58; uji cabut internet 1 jam = N9 Windows)_
- [x] Heartbeat. _(N2/N5, 2026-09-25: tiap 60 dtk — versi, layar, event aktif, kamera, printer, kertas, antrean, error terakhir)_
- [x] Halaman tamu: state unknown/pending/ready/expired/removed, simpan via share sheet, branding event. _(N6, 2026-09-25: branding = nama & tanggal event; warna/logo menyusul admin Fase 3, DECISIONS #60)_
- [x] Tracking `qr_open`, `save`, `save_all`. _(N7, 2026-09-25: `POST /api/track`, 60/menit per IP)_
- [x] Sentry web + booth. _(N8, 2026-09-25: tanpa data tamu, DECISIONS #68)_

**Selesai jika:** di event nyata, ≥ 95% sesi ter-upload ≤ 5 menit saat online; tes cabut internet 1 jam lalu sambung lagi → semua sesi terkirim tanpa campur tangan.

## Fase 3 — Admin + klien + live
- [x] Auth & role (owner/admin/crew). _(A1, 2026-09-25: login email+sandi, guard anggota, RLS lewat klien user; undangan tim E7 + lupa kata sandi, DECISIONS #69)_
- [x] Daftar event, pengaturan event lengkap, penugasan device. _(A3, 2026-09-25)_
- [ ] Editor template (overlay + slot + teks + font) dengan versi. _(A4 sementara: preset + overlay + warna latar, DECISIONS #66)_
- [x] Halaman device. _(A2, 2026-09-25)_
- [x] Dashboard event: statistik, share analytics, status booth, grid + aksi massal. _(A5, 2026-09-25)_
- [x] Moderasi: sembunyikan/hapus + audit log. _(A5, 2026-09-25)_
- [x] Galeri klien: hero, timeline per jam, lightbox, favorit, slideshow, toggle galeri publik, hitung mundur. _(A7, 2026-09-25: semua kecuali toggle galeri publik = Fase 5; + download semua ZIP)_
- [x] Worker ZIP. _(A9, 2026-09-25: ZIP dirakit di browser dengan `client-zip`, tanpa worker server)_
- [x] Live slideshow realtime. _(A8, 2026-09-25: polling, bukan websocket)_
- [x] Cron retensi + lifecycle rule bucket. _(A9, 2026-09-25: Vercel Cron + `CRON_SECRET`; lifecycle R2 cuma abort multipart 7 hari, retensi diatur cron)_
- [x] Link klien: salin, buat ulang, cabut. _(A6, 2026-09-25)_

**Selesai jika:** satu event disiapkan 100% dari admin tanpa menyentuh file lokal, dan klien sungguhan menerima & memakai galerinya.

## Fase 4 — Mode photobox
- [ ] Layout ganda per event + harga + harga lembar tambahan.
- [ ] Flow pilih layout → pilih jumlah → QRIS → sesi dengan timer.
- [ ] Xendit: buat QRIS, webhook, cek status cadangan, adapter `PaymentProvider`.
- [ ] Halaman transaksi & laporan omzet + export CSV.
- [ ] Uji di lokasi dengan modem 4G.

**Selesai jika:** 100 transaksi nyata dengan ≥ 98% sukses tanpa bantuan crew dan rekonsiliasi cocok dengan dashboard Xendit.

## Fase 5 — Ekspansi
- [ ] Sony a7III via Camera Remote SDK.
- [ ] Animasi (GIF/boomerang) di booth, halaman tamu, galeri. _(GIF foto sesi di booth + halaman tamu sudah dimajukan 2026-09-25, DECISIONS #62; sisa: boomerang/video live view, galeri)_
- [ ] Lead capture (gate/optional + consent) + export CSV dari admin.
- [ ] Galeri event publik untuk tamu.
- [ ] Temukan Foto Saya (embedding di booth, pgvector, consent).

## 🚦 Gerbang Windows Matang

Syarat sebelum masuk Fase 6:
- [ ] 10 event nyata berturut-turut (mode event) tanpa pindah ke LumaBooth.
- [ ] Mode photobox berjalan ≥ 1 bulan di lokasi tetap.
- [ ] Langganan LumaBooth dihentikan.
- [ ] Tidak ada bug kritis terbuka.

## Fase 6 — macOS
- [ ] Electron booth build macOS (signing & notarization).
- [ ] Camera Service di macOS: EDSDK versi macOS, Sony CRSDK macOS.
- [ ] `CupsPrinterAdapter` untuk DNP.
- [ ] Stress test 500 sesi di MacBook.

## Fase 7 — Air Station + Android + iPad
- [ ] Mode Air Station di app desktop (server LAN, mDNS, pairing, antrean print).
- [ ] `apps/booth-mobile` (Capacitor) memakai `booth-core`.
- [ ] `platform-capacitor`: kamera bawaan, SQLite, filesystem, keep-awake, kiosk/guided access.
- [ ] Print via Air Station.
- [ ] Rilis Android (Play Store/APK) & iPad (App Store/TestFlight).

**Selesai jika:** satu event berjalan dengan iPad/tablet Android di depan tamu + laptop Air Station + DNP, tanpa internet.

## Fase 8 — Siap SaaS
- [ ] Onboarding organisasi baru (self-serve).
- [ ] Billing langganan & lisensi per device.
- [ ] White-label halaman tamu & galeri (domain & branding vendor).
- [ ] Integrasi Tetra Ops via API (booking → event otomatis).
- [ ] Hardening RLS + audit keamanan multi-tenant.
