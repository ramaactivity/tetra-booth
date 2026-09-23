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
- [x] `packages/ui`: design tokens sesuai `08-DESIGN.md` (tema per event).
- [x] `packages/booth-core` + interface `BoothPlatform` + `packages/platform-electron` (hanya adapter Electron).
- [x] `packages/template-engine`: render 4R & 2x6x2 + test snapshot.
- [ ] Supabase project dev: migrasi awal (semua tabel + RLS), seed organisasi Tetra. _(SQL + RLS teruji di Postgres sementara: `pnpm --filter @tetra/db test`; tinggal `supabase link` + `db push` ke project dev)_
- [ ] Bucket R2 dev + custom domain media. _(script cek siap: `pnpm --filter web r2:check`; custom domain ditunda, lihat DECISIONS #8)_
- [x] Skeleton `apps/booth`, `apps/web`, `services/camera` yang bisa jalan.

**Selesai jika:** template engine merender contoh layout identik di browser & Electron; `dotnet run` Camera Service menerima koneksi WebSocket dari booth. _(Terpenuhi 2026-09-23: hash `ae20f38c…` sama di Vitest, Playwright/Chromium, dan Electron; health check Electron → Camera Service OK.)_

## Fase 1 — Booth offline (mode event)
- [ ] Camera Service: Canon EDSDK (connect, reconnect, live view, capture), hot-folder fallback.
- [ ] Camera Service: print DNP (4R & 2x6x2), status spooler.
- [ ] Supervisor & watchdog di Electron main.
- [ ] Kiosk: auto-start, fullscreen, anti-sleep.
- [ ] State machine sesi: attract → countdown → capture → review/retake → compose → print select → printing → QR.
- [ ] SQLite lokal, struktur folder sesi, output strip/original/thumb.
- [ ] Mode crew: pilih event (dari file bundle lokal), cek kamera, test print, counter kertas, keluar kiosk.
- [ ] Orientasi landscape & portrait.
- [ ] Logging lokal.

**Selesai jika:**
1. Stress test otomatis 500 sesi semalaman tanpa crash, memory leak, atau kamera putus permanen (diuji di 600D dan 70D).
2. Dipakai di 1 event nyata dengan LumaBooth standby sebagai cadangan, tanpa perlu pindah ke cadangan.

## Fase 2 — Cloud + halaman tamu
- [ ] Pairing device.
- [ ] Pull event + bundle, cache offline.
- [ ] Antrean upload + presigned R2 + retry backoff.
- [ ] Heartbeat.
- [ ] Halaman tamu: state unknown/pending/ready/expired/removed, simpan via share sheet, branding event.
- [ ] Tracking `qr_open`, `save`, `save_all`.
- [ ] Sentry web + booth.

**Selesai jika:** di event nyata, ≥ 95% sesi ter-upload ≤ 5 menit saat online; tes cabut internet 1 jam lalu sambung lagi → semua sesi terkirim tanpa campur tangan.

## Fase 3 — Admin + klien + live
- [ ] Auth & role (owner/admin/crew).
- [ ] Daftar event, pengaturan event lengkap, penugasan device.
- [ ] Editor template (overlay + slot + teks + font) dengan versi.
- [ ] Halaman device.
- [ ] Dashboard event: statistik, share analytics, status booth, grid + aksi massal.
- [ ] Moderasi: sembunyikan/hapus + audit log.
- [ ] Galeri klien: hero, timeline per jam, lightbox, favorit, slideshow, toggle galeri publik, hitung mundur.
- [ ] Worker ZIP.
- [ ] Live slideshow realtime.
- [ ] Cron retensi + lifecycle rule bucket.
- [ ] Link klien: salin, buat ulang, cabut.

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
- [ ] Animasi (GIF/boomerang) di booth, halaman tamu, galeri.
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
