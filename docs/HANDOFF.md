# Handoff Mac ↔ Windows

Antrean tugas dan log antara Claude Mac dan Claude Windows. Protokol: `docs/WINDOWS.md` §4.
Tugas diambil dari atas. Centang saat selesai dan rujuk laporannya.

## Untuk Windows

- [x] **W-001 Verifikasi repo di Windows.** `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (termasuk uji RLS dengan embedded Postgres), `dotnet test services/camera`. Catat durasi install dan tiap langkah. Kalau ada yang gagal karena perbedaan Windows (path, CRLF, native module), perbaiki di branch `win` bila jelas khusus Windows; kalau menyentuh logika lintas platform, laporkan di "Untuk Mac".
- [x] **W-002 Smoke test booth + Camera Service.** Jalankan Camera Service, build dan jalankan booth dengan log (lihat WINDOWS.md §5). Lulus jika log berisi `[fase0] camera service: OK` dan `[fase0] engine hash:` sama dengan hash 4R di `packages/template-engine/test/__snapshots__/render.test.ts.snap`. Cek juga via screenshot bahwa layar Attract tampil (teks "SENTUH UNTUK MULAI", font sans). Catat waktu start aplikasi.
- [x] **W-003 Inventaris hardware.** Windows edition/build, CPU, RAM, disk kosong. Semua layar: resolusi, scaling, touchscreen ada/tidak. Printer (`Get-Printer`): nama, driver, port. Untuk printer DNP (jika ada) dan "Microsoft Print to PDF": daftar `PaperSizes` persis dari `System.Drawing.Printing.PrinterSettings` (nama + ukuran). Perangkat USB yang cocok `Canon|EOS|DNP|DS-RX1|DS620|Nikon|Sony` (`Get-PnpDevice -PresentOnly`). Webcam ada/tidak.
- [x] **W-004 Laporan bootstrap.** Tulis `docs/reports/windows/<tanggal>-bootstrap.md` berisi hasil W-001..W-003, masalah, dan saran. Push ke `win`. Ringkas hasilnya di chat untuk Rama. → `docs/reports/windows/2026-09-24-bootstrap.md`
- [ ] **W-005 Uji jalur build dari Mac (`update.cmd`).** Di `$W\devbuild`, unduh `https://pub-0bfddc60cd624137a0f4075f8d41dbb7.r2.dev/dev-builds/update.cmd` lalu jalankan (tanpa admin). Lulus jika `app\booth\Tetra Booth.exe` dan `app\camera\TetraCamera.exe` jalan dan log/screenshot menunjukkan health OK + hash sama seperti W-002. Catat ukuran unduhan, durasi unduh+ekstrak, dan peringatan SmartScreen/Defender kalau ada. Hentikan prosesnya setelah selesai.
- [ ] **W-006 Riset printer untuk M4 (tanpa kode fitur).** Dengan skrip PowerShell sementara (tidak di-commit), cetak gambar uji 1200×1800 px ke "Microsoft Print to PDF" memakai `System.Drawing.Printing`: coba paper size 4×6 jika ada, catat `PrinterSettings.DefaultPageSettings` (margin, `PrintableArea`, `HardMarginX/Y`, resolusi), dan apakah hasil PDF tepat 4×6 inci tanpa scaling/margin. Kalau ada DNP terpasang, catat hal yang sama tanpa benar-benar mencetak. Tulis temuan di laporan: ini dasar desain `WindowsPrinterAdapter`.
- [ ] **W-007 Performa dasar.** Di booth hasil build, ukur: waktu dari start proses sampai `[fase0] engine hash` tercatat, waktu render fixture 4R (tambahkan `performance.now()` sementara secara lokal, jangan di-commit), pemakaian RAM Electron + Camera Service setelah 5 menit idle (`Get-Process`). Bandingkan dengan target 03-TSD §14.
- [ ] **W-008 Laporan lanjutan.** Tulis `docs/reports/windows/<tanggal>-uji-lanjutan.md` (W-005..W-007), push ke `win`, ringkas di chat.

## Untuk Mac

- [ ] **M-001 Merge fix `pnpm-workspace.yaml`.** Placeholder `electron-winstaller: set this to true or false` membuat `pnpm install --frozen-lockfile` gagal (`ERR_PNPM_IGNORED_BUILDS`) sebelum Electron terunduh. Di `win` diganti `false` (commit `3cccbbd`). Detail: laporan bootstrap.
- [ ] **M-002 WINDOWS.md §5: screenshot jendela aplikasi saja.** Screenshot layar penuh di laptop pinjaman ikut menangkap jendela pribadi pemilik. Pakai `PrintWindow` ke jendela Electron, dengan proses DPI-aware (scaling laptop 150%).
- [ ] **M-003 Kamera: webcam dulu.** Arahan Rama 2026-09-24: belum ada kamera Canon. Uji kamera sementara pakai webcam laptop (HP 5MP Camera). Uji Canon/EDSDK dipindah ke fase berikutnya. Sesuaikan PLAN-FASE-1 bila perlu.

## Log

| Tanggal | Mesin | Catatan |
|---|---|---|
| 2026-09-24 | Windows | W-001..W-004 selesai. Semua test lulus, hash 4R cocok, tidak ada DNP/Canon, ada webcam. Laporan: `docs/reports/windows/2026-09-24-bootstrap.md`. |
| 2026-09-24 | Mac | Tugas W-005..W-008 ditambahkan (uji update.cmd, riset printer, performa). |
| 2026-09-24 | Mac | Deploy key `tetra-windows-deploy` (id 164281077, read-write) dipasang. Cabut saat laptop dikembalikan: `gh repo deploy-key delete 164281077`. |
| 2026-09-24 | Mac | Runbook Windows, handoff, dan rencana Fase 1 dibuat. Branch `win` dibuat dari `main`. |
