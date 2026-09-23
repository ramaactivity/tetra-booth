# 04 — Stack

## Ringkasan

| Lapisan | Pilihan | Alasan | Ditolak |
|---|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Satu repo untuk booth, web, service, paket bersama | Repo terpisah (template engine jadi dobel) |
| Bahasa (JS) | TypeScript strict | Tipe dibagi antara booth & web | – |
| Booth shell | Electron + electron-vite | UI web, akses filesystem & proses native, stack lama sudah pakai | WPF/XAML (kontrol desain lemah), Tauri (Rust, ekosistem printing lebih tipis) |
| Booth UI | React + Tailwind + Zustand | Sama dengan web; token desain dibagi lewat `packages/ui` | – |
| State sesi booth | XState (atau reducer bertipe) | Alur sesi = state machine, harus bisa diuji | `useState` berserakan |
| Booth mobile (Fase 7) | Capacitor (Android & iPad) | Memakai `packages/booth-core` yang sama; akses kamera & SQLite lewat plugin | React Native (UI harus ditulis ulang) |
| Air Station discovery (Fase 7) | mDNS/Bonjour | Booth menemukan station tanpa ketik IP | – |
| DB lokal | SQLite via better-sqlite3 | Sinkron, cepat, tahan crash (WAL) | IndexedDB (susah diakses dari main) |
| Kamera & print | C# .NET 10 console service | EDSDK & Sony SDK native; printing Windows paling lengkap di .NET | digiCamControl (proses terpisah milik orang, Sony lemah, jarang update), Node native addon (rapuh) |
| Kanal booth ↔ service | WebSocket localhost | Satu kanal untuk perintah, event, dan frame live view biner | HTTP polling (latency live view) |
| Web | Next.js (App Router) di Vercel | Halaman tamu, klien, live, admin, dan API dalam satu app | – |
| UI web | React + Tailwind + shadcn/ui (admin saja) | Admin cepat dibangun; halaman tamu & klien didesain custom | – |
| Database | Supabase Postgres | Data relasional, laporan SQL, RLS untuk multi-tenant, pgvector (Fase 5) | Firebase (NoSQL, laporan sulit, tenant isolation manual) |
| Auth | Supabase Auth (admin/crew) | Satu paket dengan DB & RLS | – |
| Realtime | Supabase Realtime | Live slideshow & dashboard | – |
| File | Cloudflare R2 + custom domain CDN | Tanpa biaya egress; traffic terbesar = tamu download | Supabase Storage / Firebase Storage / S3 (egress mahal) |
| ZIP | Cloudflare Worker | Streaming ZIP langsung dari R2 tanpa batas memori/waktu Vercel | Generate ZIP di Vercel |
| Pembayaran | Xendit (QRIS dinamis) | API rapi, dokumentasi jelas | Midtrans (setara; tidak dipilih karena belum ada akun) |
| Cron | Vercel Cron | Retensi harian | – |
| Validasi | zod | Satu skema untuk booth, API, admin | – |
| Monitoring | Sentry | Web + Electron | – |
| Update booth | electron-updater (artefak di R2) | Update terkontrol dari mode crew | – |
| Installer | electron-builder (NSIS) | Satu installer berisi Electron + Camera Service | – |
| Test | Vitest (TS), xUnit (C#), Playwright (web) | – | – |

## Versi

Gunakan versi stabil terbaru saat Fase 0 dimulai dan kunci di lockfile. .NET memakai versi LTS (.NET 10).

## Environment variables

| Var | Dipakai di |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Web — base URL untuk QR & link (domain belum final) |
| `NEXT_PUBLIC_MEDIA_URL` | Web & booth — base URL media R2 |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Web |
| `SUPABASE_SERVICE_ROLE_KEY` | Web server saja |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Web server |
| `ZIP_SIGNING_SECRET` | Web server & Worker |
| `XENDIT_SECRET_KEY`, `XENDIT_CALLBACK_TOKEN` | Web server |
| `CRON_SECRET` | Web (Vercel Cron) |
| `SENTRY_DSN` | Web & booth |
| `TETRA_API_URL` | Booth |
