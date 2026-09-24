# Rencana Fase 1: Booth offline (mode event)

Status: **menunggu persetujuan Rama.** Tidak ada kode Fase 1 sebelum disetujui (CLAUDE.md).

Target selesai (07-ROADMAP): stress test 500 sesi semalaman tanpa crash/leak/kamera putus permanen di 600D dan 70D, lalu 1 event nyata dengan LumaBooth sebagai cadangan tanpa perlu pindah.

## Prinsip pembagian kerja

- Semua yang bisa diuji tanpa Windows dikerjakan di **Mac** dengan **kamera & printer simulasi**, supaya alur sesi lengkap bisa jalan dan dites otomatis di mana saja (Mac, CI, Windows).
- **Windows** memverifikasi setiap milestone di Windows asli, lalu mengerjakan bagian yang hanya ada di Windows: spooler printer, kiosk, EDSDK, stress test dengan hardware.
- Canon EDSDK belum ada. Semua pekerjaan lain tidak menunggu SDK.

## Milestone

| # | Isi | Mesin | Uji selesai |
|---|---|---|---|
| M1 | **Alur sesi lengkap dengan simulasi.** Kamera simulasi di Camera Service (live view JPEG ≥ 20 fps, capture menulis file) + perintah `camera.*`, `liveview.*`, `capture`, event. State machine sesi (reducer bertipe) attract → countdown → capture ×N → review/retake → compose → print select → printing → QR. Layar booth sesuai 08-DESIGN, landscape & portrait. | Mac, lalu Windows verifikasi | Vitest state machine; satu sesi penuh berjalan otomatis (mode demo) di Mac dan Windows |
| M2 | **Penyimpanan lokal.** SQLite (better-sqlite3, WAL) sesuai 06-DATA-MODEL §3, folder sesi, output strip/strip_web/original 2400px/thumb 480px lewat template engine. Logging lokal rotasi harian. | Mac, Windows cek native module | Test repositori; file output benar ukurannya |
| M3 | **Supervisor & watchdog.** Electron main spawn Camera Service dengan port & token acak, health tiap 5 dtk, restart setelah 3x gagal, auto-reconnect UI. | Mac, Windows uji kill proses | Bunuh Camera Service 20x, booth pulih sendiri |
| M4 | **Printer Windows.** `WindowsPrinterAdapter` (System.Drawing.Printing, paper size dari driver, status spooler, error → `print.failed`). Antrean print, counter kertas. Uji dulu ke "Microsoft Print to PDF", lalu DNP RX1HS (4R & 2x6x2). | **Windows** | PDF 1200×1800 tepat tanpa scaling; cetak DNP asli |
| M5 | **Kiosk.** Auto-start saat login, fullscreen, kursor tersembunyi, anti-sleep, keluar hanya dari mode crew. | Mac (kode), **Windows** (uji) | Restart Windows → booth muncul sendiri |
| M6 | **Mode crew.** Tap 5x pojok + PIN, pilih event dari bundle lokal, cek kamera (live view + test shot), test print, counter kertas, keluar kiosk. | Mac, Windows verifikasi | Alur crew manual lewat screenshot |
| M7 | **Canon EDSDK** (menunggu SDK). Wrapper C#, satu thread antrean, SaveTo_Host, matikan auto power off, JPEG Large Fine, reconnect tiap 2 dtk. Fallback hot-folder. | **Windows** + kamera | Capture & live view nyata di 600D/70D; cabut USB → pulih |
| M8 | **Stress test.** Driver otomatis 500 sesi (simulasi di CI/Mac, kamera nyata di Windows semalaman), pantau memori & handle. | Mac (harness), **Windows** (malam) | 500 sesi tanpa crash/leak |
| M9 | **Build Windows via CI.** Setelah SQLite (native module), build win-x64 dipindah ke job GitHub Actions `windows-latest` yang meng-upload zip ke R2, karena cross-build native module dari Mac tidak andal. `update.cmd` tetap sama. | Mac (CI) | Zip dari CI jalan di laptop |

Urutan kerja: M1 → M2 → M3 → M9 → M4/M5/M6 paralel → M7 (saat SDK ada) → M8 → event nyata.

## Yang dibutuhkan dari Rama

- Persetujuan rencana ini.
- Canon EDSDK (daftar Canon Developer Program) untuk M7.
- Kamera 600D/70D + DNP RX1HS + kertas di dekat laptop Windows untuk M4, M7, M8. Sebelum itu, M4 cukup diuji ke PDF.
