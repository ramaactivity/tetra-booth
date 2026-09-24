# Handoff Mac ↔ Windows

Antrean tugas dan log antara Claude Mac dan Claude Windows. Protokol: `docs/WINDOWS.md` §4.
Tugas diambil dari atas. Centang saat selesai dan rujuk laporannya.

## Untuk Windows

- [ ] **W-001 Verifikasi repo di Windows.** `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (termasuk uji RLS dengan embedded Postgres), `dotnet test services/camera`. Catat durasi install dan tiap langkah. Kalau ada yang gagal karena perbedaan Windows (path, CRLF, native module), perbaiki di branch `win` bila jelas khusus Windows; kalau menyentuh logika lintas platform, laporkan di "Untuk Mac".
- [ ] **W-002 Smoke test booth + Camera Service.** Jalankan Camera Service, build dan jalankan booth dengan log (lihat WINDOWS.md §5). Lulus jika log berisi `[fase0] camera service: OK` dan `[fase0] engine hash:` sama dengan hash 4R di `packages/template-engine/test/__snapshots__/render.test.ts.snap`. Cek juga via screenshot bahwa layar Attract tampil (teks "SENTUH UNTUK MULAI", font sans). Catat waktu start aplikasi.
- [ ] **W-003 Inventaris hardware.** Windows edition/build, CPU, RAM, disk kosong. Semua layar: resolusi, scaling, touchscreen ada/tidak. Printer (`Get-Printer`): nama, driver, port. Untuk printer DNP (jika ada) dan "Microsoft Print to PDF": daftar `PaperSizes` persis dari `System.Drawing.Printing.PrinterSettings` (nama + ukuran). Perangkat USB yang cocok `Canon|EOS|DNP|DS-RX1|DS620|Nikon|Sony` (`Get-PnpDevice -PresentOnly`). Webcam ada/tidak.
- [ ] **W-004 Laporan bootstrap.** Tulis `docs/reports/windows/<tanggal>-bootstrap.md` berisi hasil W-001..W-003, masalah, dan saran. Push ke `win`. Ringkas hasilnya di chat untuk Rama.

## Untuk Mac

_(kosong)_

## Log

| Tanggal | Mesin | Catatan |
|---|---|---|
| 2026-09-24 | Mac | Runbook Windows, handoff, dan rencana Fase 1 dibuat. Branch `win` dibuat dari `main`. |
