# CLAUDE.md — Tetra Booth

Kamu sedang membangun Tetra Booth: platform photobooth (booth Windows + cloud + halaman tamu/klien + admin). Sebelum mengerjakan apa pun, baca `docs/README.md`, lalu dokumen yang relevan dengan tugas.

## Cara kerja
- Kerjakan **per fase** sesuai `docs/07-ROADMAP.md`. Jangan membangun fitur fase berikutnya.
- Sebelum menulis kode untuk satu item roadmap: jelaskan rencana singkat (file yang disentuh, keputusan teknis). Setelah selesai: centang item di roadmap.
- Jika spesifikasi tidak jelas atau bertentangan, **tanya**, jangan menebak. Jika perlu menyimpang dari dokumen, catat alasannya di `docs/DECISIONS.md`.

## Aturan yang tidak boleh dilanggar
1. **Offline-first.** Tidak ada langkah sesi booth yang menunggu jaringan, kecuali pembayaran QRIS.
2. **Satu template engine.** Render strip hanya lewat `packages/template-engine`. Jangan menulis kode render kedua di booth atau admin.
3. **`organization_id` di setiap tabel dan setiap query.** RLS aktif di semua tabel.
4. **Harga dihitung server.** Booth tidak pernah mengirim nominal pembayaran.
5. **Service role Supabase hanya di server.** Tidak pernah di booth atau kode browser.
6. **Sync idempotent.** Semua endpoint booth aman dipanggil ulang.
7. **Update aplikasi booth tidak pernah otomatis** — hanya dari mode crew.
8. DLL SDK kamera (Canon/Sony) tidak di-commit ke git.
9. `packages/booth-core` tidak boleh mengimpor Electron, Node, atau Capacitor. Akses perangkat hanya lewat `BoothPlatform`.
10. Camera Service: kode di luar `TetraCamera.Print.Windows` tidak memakai API khusus Windows.
11. Jangan mengerjakan macOS, Android, iPad, atau Air Station sebelum Fase 6/7.

## Dua mesin (Mac & Windows)
- Mac: koding utama di `main`. Windows (laptop pinjaman, dipantau via Remote Control): hanya di branch `win`, ikuti `docs/WINDOWS.md`.
- Komunikasi antar-Claude lewat `docs/HANDOFF.md` (antrean tugas + log) dan `docs/reports/windows/`. Memori Claude tidak dibagi antar mesin.
- Rencana Fase 1 & pembagian mesin: `docs/PLAN-FASE-1.md`.

## Konvensi kode
- TypeScript `strict`, tanpa `any`. Validasi input di setiap batas (IPC, WebSocket, API) dengan zod dari `packages/shared`.
- State sesi booth = state machine eksplisit, bukan kumpulan `useState`.
- Semua teks UI dalam Bahasa Indonesia, dikumpulkan di satu file copy per app.
- Desain booth & halaman tamu: ikuti `docs/08-DESIGN.md` (minimalis, tema dari branding event). Jangan pakai gradient, emoji, shadow tebal, atau gaya template generik.
- C#: .NET 10, nullable enabled, semua panggilan EDSDK lewat satu thread antrean.
- Test: Vitest untuk TS, xUnit untuk C#, Playwright untuk alur web penting.

## Perintah
```
pnpm install
dotnet build services/camera # sekali, supaya booth bisa men-spawn Camera Service
pnpm dev --filter booth      # Electron (spawn Camera Service sendiri; --no-spawn untuk service manual)
pnpm dev --filter web        # Next.js di http://localhost:3000
dotnet run --project services/camera/TetraCamera.Host   # ws://127.0.0.1:8765/ws?token=dev
pnpm lint && pnpm typecheck && pnpm test                # TS (Biome, tsc, Vitest)
dotnet test services/camera                             # C# (xUnit)
pnpm --filter @tetra/db push   # migrasi ke project dev (SUPABASE_DB_URL di .env.local root)
pnpm --filter @tetra/db seed   # seed organisasi Tetra + owner
pnpm --filter @tetra/db types  # generate tipe ke packages/db/src/database.types.ts
pnpm --filter web r2:check   # uji kredensial R2 (butuh apps/web/.env.local)
pnpm dist:dev                # build win-x64 (Electron + Camera Service) → zip → R2; laptop Windows: update.cmd
```
Catatan: Node 24 (`.node-version`), pnpm via corepack, .NET 10 SDK. Kalau .NET tidak di lokasi standar (mis. `~/.dotnet`), set `DOTNET_ROOT` supaya binary dev Camera Service jalan. Flag uji booth: lihat `apps/booth/src/main/config.ts`. Di macOS, `ELECTRON_RUN_AS_NODE` harus kosong saat menjalankan Electron dari terminal editor.
Keputusan & penyimpangan dari dokumen: `docs/DECISIONS.md`.
