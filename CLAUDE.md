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
pnpm dev --filter booth      # Electron
pnpm dev --filter web        # Next.js
dotnet run --project services/camera/TetraCamera.Host
pnpm test
```
(Sesuaikan setelah Fase 0 selesai.)
