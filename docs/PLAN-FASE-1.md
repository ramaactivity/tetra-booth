# Rencana Fase 1: Booth offline (mode event)

Status: **disetujui Rama 2026-09-24** ("coding boleh dilanjutkan"). Revisi 2026-09-24: kamera Canon/EDSDK dipindah keluar Fase 1, kamera uji = webcam (DECISIONS #26); desain printer dari riset W-006 (DECISIONS #27).

Target selesai (07-ROADMAP, direvisi): alur sesi lengkap berjalan di Windows dengan webcam dan printer; stress test 500 sesi otomatis (kamera simulasi) tanpa crash/leak. Uji Canon 600D/70D dan event nyata pindah ke Fase 1b (lihat roadmap).

## Prinsip pembagian kerja

- Semua yang bisa diuji tanpa Windows dikerjakan di **Mac** dengan **kamera & printer simulasi**, supaya alur sesi lengkap bisa jalan dan dites otomatis di mana saja (Mac, CI, Windows).
- **Windows** memverifikasi setiap milestone di Windows asli, lalu mengerjakan bagian yang hanya ada di Windows: spooler printer, kiosk, EDSDK, stress test dengan hardware.
- Belum ada kamera Canon. Kamera uji Fase 1 = **webcam** (laptop Windows: HP 5MP Camera; Mac: kamera bawaan), lewat `getUserMedia` di renderer, di balik `BoothPlatform.camera`. Camera Service tetap memegang kamera simulasi (untuk test otomatis & stress) dan nanti DSLR.
- Laptop Windows uji tidak punya touchscreen dan scaling 150% (1280×800 logis): layout diuji di situ, sentuhan di hardware booth nanti.

## Milestone

| # | Isi | Mesin | Uji selesai |
|---|---|---|---|
| M1 | **Alur sesi lengkap dengan webcam & simulasi.** Sumber kamera `webcam` (renderer, `getUserMedia` + `ImageCapture`, live view di-mirror, hasil tidak) dan `simulated` (Camera Service: live view JPEG ≥ 20 fps, capture menulis file, perintah `camera.*`, `liveview.*`, `capture`, event). State machine sesi (reducer bertipe) attract → countdown → capture ×N → review/retake → compose → print select → printing → QR. Layar booth sesuai 08-DESIGN, landscape & portrait. | Mac, lalu Windows verifikasi dengan webcam | Vitest state machine; satu sesi penuh dengan webcam di Mac dan Windows; mode demo otomatis dengan kamera simulasi |
| M2 | **Penyimpanan lokal.** SQLite (`node:sqlite` bawaan Electron, WAL; DECISIONS #32) sesuai 06-DATA-MODEL §3, folder sesi, output strip/strip_web/original 2400px/thumb 480px lewat template engine. Logging lokal rotasi harian. | Mac, Windows cek native module | Test repositori; file output benar ukurannya |
| M3 | **Supervisor & watchdog.** Electron main spawn Camera Service dengan port & token acak, health tiap 5 dtk, restart setelah 3x gagal, auto-reconnect UI. | Mac, Windows uji kill proses | Bunuh Camera Service 20x, booth pulih sendiri |
| M4 | **Printer Windows.** `WindowsPrinterAdapter` sesuai desain di bawah. Antrean print, counter kertas, `print.submit`/`print.status`/`printer.status`. | **Windows** | Lihat "Kriteria uji M4" di bawah; cetak DNP asli menyusul saat DNP tersedia |
| M5 | **Kiosk.** Auto-start saat login, fullscreen, kursor tersembunyi, anti-sleep, keluar hanya dari mode crew. | Mac (kode), **Windows** (uji) | Restart Windows → booth muncul sendiri |
| M6 | **Mode crew.** Tap 5x pojok + PIN, pilih event dari bundle lokal, cek kamera (live view + test shot), test print, counter kertas, keluar kiosk. | Mac, Windows verifikasi | Alur crew manual lewat screenshot |
| M7 | **Hot-folder fallback** (FileSystemWatcher, lintas platform). _Canon EDSDK dipindah ke Fase 1b._ | Mac, Windows verifikasi | File JPEG baru di folder = capture berikutnya |
| M8 | **Stress test.** Driver otomatis 500 sesi dengan kamera simulasi + print ke Print to PDF (Windows) / printer null (Mac, CI), pantau memori & handle. | Mac (harness), **Windows** (semalam) | 500 sesi tanpa crash; RAM & handle tidak naik terus |
| M9 | **Build Windows via CI.** _Tidak mendesak lagi:_ `node:sqlite` bukan modul native, jadi `pnpm dist:dev` dari Mac tetap valid. Dikerjakan kalau nanti ada modul native, atau untuk installer bertanda tangan. | Mac (CI) | Zip dari CI jalan di laptop |

Status M1 (2026-09-24): kode selesai di `main`, teruji di Mac dengan kamera simulasi (landscape & portrait). Menunggu verifikasi webcam di Windows (W-011).
Status M2 (2026-09-24): kode selesai di `main`: DB + output + log harian, teruji di Mac (compose 84–118 ms, output 181–323 ms di belakang layar). Verifikasi Windows: W-012.
Status M3 (2026-09-24): supervisor di `main`, teruji di Mac. Verifikasi Windows + print end-to-end: W-013.
Status M4 (2026-09-24): `WindowsPrinterAdapter` selesai (W-009), kriteria uji 1 & 2 lulus.
Status M6 (2026-09-24): mode crew di `main` (PIN, event bundle, cek kamera, test print, kertas, cetak ulang, peringatan printer), e2e Playwright-Electron lulus di Mac. Verifikasi Windows: W-014.

Urutan kerja: **M4 (Windows) paralel dengan M1 → M2 → M3 (Mac)** → M9 → M5/M6 → M7 → M8.

Kiosk (M5) di laptop pinjaman: auto-start mengubah setelan startup Windows, jadi hanya diuji dengan cara yang bisa dibatalkan tanpa admin dan dikembalikan setelah uji, atau di laptop booth sendiri.

## Desain M4: `WindowsPrinterAdapter` (dari riset W-006)

Temuan: driver hanya menghormati ukuran yang ada di `PrinterSettings.PaperSizes`. `PaperSize` custom diabaikan diam-diam (Print to PDF tetap mencetak Letter walau `PageBounds` bilang 4×6). `PageBounds` tidak bisa dipercaya; `PrintableArea` bisa.

1. **Pemilihan kertas = logika murni** di `TetraCamera.Print` (lintas platform, xUnit): input daftar ukuran driver (nama, lebar, tinggi dalam 1/100 in), preset (`4R`/`2x6x2`), dan nama kertas dari config device. Urutan: nama persis dari config → untuk `4R` saja, ukuran 400×600 (orientasi mana pun, toleransi ±2) → tidak ada = gagal `paper_not_supported`. **Tidak pernah** membuat `PaperSize` custom, tidak pernah jatuh diam-diam ke Letter/A4.
2. `2x6x2` hanya lewat nama kertas dari config (opsi potong 2 inci di driver DNP punya nama sendiri), tanpa tebakan ukuran.
3. Config sementara lewat argumen Camera Service: `--printer`, `--paper-4r`, `--paper-2x6x2` (nanti dari config device lewat Electron).
4. Cetak: `PrintDocument` + `StandardPrintController` (tanpa dialog), margin 0, `PageUnit = Display`, `TranslateTransform(-HardMarginX, -HardMarginY)`, gambar 1200×1800 digambar ke 400×600 (tepat 4×6 in, tanpa scaling lain), `Copies` dari job.
5. Validasi sebelum cetak: `PrintableArea` harus menutup ukuran kertas terpilih (toleransi kecil). Kalau tidak → `print.failed` `paper_mismatch`, tidak mencetak.
6. Status: job table di memori (`queued → printing → done/failed`), error jadi event `print.failed` berkode; status printer (`ready/error/unavailable`, pesan) dari spooler Windows. API Windows hanya di `TetraCamera.Print.Windows` (aturan 10).

### Kriteria uji M4 (pengganti "PDF 4×6")

Print to PDF tidak punya 4×6, jadi uji dibagi tiga:
1. **Unit (CI, semua OS):** pemilihan kertas: nama config menang; 4R cocok ukuran di kedua orientasi; daftar tanpa 4×6 dan tanpa config → `paper_not_supported`; `2x6x2` tanpa config → gagal.
2. **Integrasi Windows (laptop, Print to PDF):** (a) config `--paper-4r A5`: PDF MediaBox = A5 dan gambar mendarat **tepat 288×432 pt di origin** (dicek dari matriks `cm` PDF), jumlah halaman = `copies`; (b) tanpa config: `print.submit` 4R → `print.failed paper_not_supported`, **tidak ada PDF Letter yang terbentuk**; (c) printer tidak ada → `printer.status unavailable`, job gagal berkode.
3. **Hardware (saat DNP tersedia):** cetak 4R & 2x6x2 fisik, cek borderless dan potongan, catat nama kertas persis dari driver DNP ke config device.

## Yang dibutuhkan dari Rama

- Persetujuan rencana ini.
- Canon EDSDK (daftar Canon Developer Program) untuk M7.
- Kamera 600D/70D + DNP RX1HS + kertas di dekat laptop Windows untuk M4, M7, M8. Sebelum itu, M4 cukup diuji ke PDF.
