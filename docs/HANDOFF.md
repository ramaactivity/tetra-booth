# Handoff Mac ↔ Windows

Antrean tugas dan log antara Claude Mac dan Claude Windows. Protokol: `docs/WINDOWS.md` §4.
Tugas diambil dari atas. Centang saat selesai dan rujuk laporannya.

## Untuk Windows

- [ ] **W-001 Verifikasi repo di Windows.** `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (termasuk uji RLS dengan embedded Postgres), `dotnet test services/camera`. Catat durasi install dan tiap langkah. Kalau ada yang gagal karena perbedaan Windows (path, CRLF, native module), perbaiki di branch `win` bila jelas khusus Windows; kalau menyentuh logika lintas platform, laporkan di "Untuk Mac".
- [ ] **W-002 Smoke test booth + Camera Service.** Jalankan Camera Service, build dan jalankan booth dengan log (lihat WINDOWS.md §5). Lulus jika log berisi `[fase0] camera service: OK` dan `[fase0] engine hash:` sama dengan hash 4R di `packages/template-engine/test/__snapshots__/render.test.ts.snap`. Cek juga via screenshot bahwa layar Attract tampil (teks "SENTUH UNTUK MULAI", font sans). Catat waktu start aplikasi.
- [ ] **W-003 Inventaris hardware.** Windows edition/build, CPU, RAM, disk kosong. Semua layar: resolusi, scaling, touchscreen ada/tidak. Printer (`Get-Printer`): nama, driver, port. Untuk printer DNP (jika ada) dan "Microsoft Print to PDF": daftar `PaperSizes` persis dari `System.Drawing.Printing.PrinterSettings` (nama + ukuran). Perangkat USB yang cocok `Canon|EOS|DNP|DS-RX1|DS620|Nikon|Sony` (`Get-PnpDevice -PresentOnly`). Webcam ada/tidak.
- [ ] **W-004 Laporan bootstrap.** Tulis `docs/reports/windows/<tanggal>-bootstrap.md` berisi hasil W-001..W-003, masalah, dan saran. Push ke `win`. Ringkas hasilnya di chat untuk Rama.
- [ ] **W-005 Uji jalur build dari Mac (`update.cmd`).** Di `$W\devbuild`, unduh `https://pub-0bfddc60cd624137a0f4075f8d41dbb7.r2.dev/dev-builds/update.cmd` lalu jalankan (tanpa admin). Lulus jika `app\booth\Tetra Booth.exe` dan `app\camera\TetraCamera.exe` jalan dan log/screenshot menunjukkan health OK + hash sama seperti W-002. Catat ukuran unduhan, durasi unduh+ekstrak, dan peringatan SmartScreen/Defender kalau ada. Hentikan prosesnya setelah selesai.
- [ ] **W-006 Riset printer untuk M4 (tanpa kode fitur).** Dengan skrip PowerShell sementara (tidak di-commit), cetak gambar uji 1200×1800 px ke "Microsoft Print to PDF" memakai `System.Drawing.Printing`: coba paper size 4×6 jika ada, catat `PrinterSettings.DefaultPageSettings` (margin, `PrintableArea`, `HardMarginX/Y`, resolusi), dan apakah hasil PDF tepat 4×6 inci tanpa scaling/margin. Kalau ada DNP terpasang, catat hal yang sama tanpa benar-benar mencetak. Tulis temuan di laporan: ini dasar desain `WindowsPrinterAdapter`.
- [ ] **W-007 Performa dasar.** Di booth hasil build, ukur: waktu dari start proses sampai `[fase0] engine hash` tercatat, waktu render fixture 4R (tambahkan `performance.now()` sementara secara lokal, jangan di-commit), pemakaian RAM Electron + Camera Service setelah 5 menit idle (`Get-Process`). Bandingkan dengan target 03-TSD §14.
- [ ] **W-008 Laporan lanjutan.** Tulis `docs/reports/windows/<tanggal>-uji-lanjutan.md` (W-005..W-007), push ke `win`, ringkas di chat.

## Untuk Mac

_(kosong)_

## Log

| Tanggal | Mesin | Catatan |
|---|---|---|
| 2026-09-24 | Mac | Tugas W-005..W-008 ditambahkan (uji update.cmd, riset printer, performa). |
| 2026-09-24 | Mac | Deploy key `tetra-windows-deploy` (id 164281077, read-write) dipasang. Cabut saat laptop dikembalikan: `gh repo deploy-key delete 164281077`. |
| 2026-09-24 | Mac | Runbook Windows, handoff, dan rencana Fase 1 dibuat. Branch `win` dibuat dari `main`. |
