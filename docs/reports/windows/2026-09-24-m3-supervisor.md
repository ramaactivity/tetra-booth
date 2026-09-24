# Laporan Windows: verifikasi M3 supervisor + print end-to-end (W-013)

Tanggal: 2026-09-24 · Basis: `main` @ `3feeaaf` (M3 + perbaikan M-007) di-merge ke `win` · Booth men-spawn Camera Service sendiri. Flag printer ditulis dalam bentuk `--flag=value`, karena bentuk dengan spasi diabaikan (M-008 no. 1).

## Ringkasan

| Langkah | Hasil |
|---|---|
| 1. Booth + printer Print to PDF | **Lulus.** 2 sesi → 2 PDF, `print_jobs` `done` |
| 2. Bunuh `TetraCamera.exe` 20x | **Lulus** untuk supervisor: 20× berhenti → start dalam ±0,6 s, demo tidak macet, 9 sesi selesai. **Tapi 2 dari 9 print hilang** (lihat temuan 1) |
| 3a. Tutup booth normal | **Lulus.** Tidak ada `TetraCamera.exe` tertinggal |
| 3b. Bunuh booth paksa | **Tidak ada proses yatim** (dugaan di `camera-service.ts` tidak terjadi di Windows) |
| 4. Build gaya `dist:dev` | **Lulus.** `Tetra Booth.exe` menemukan `..\camera\TetraCamera.exe` sendiri dan mencetak |
| 5. Event print (M-007) | **Lulus.** `printer_unavailable` dan `paper_not_supported` → `[print] GAGAL` + `print_jobs.failed` berkode. Config benar → `[print] selesai` + `done` |
| 6. Portrait 450×800 | **Lulus.** Review foto kiri + Ulang kanan, attract judul tengah + tombol satu baris, print_select muat |

## 1. Booth + printer

`--camera=simulated --demo --printer="Microsoft Print to PDF" --paper-2x6x2=A5 --print-to-file=$W\prints`

```
[boot] Tetra Booth 0.0.1 · data C:\Users\USER\TetraBooth\data · sesi terputus ditandai: 0
[supervisor] …\TetraCamera.Host\bin\Debug\net10.0\TetraCamera.exe port 61776 --printer Microsoft Print to PDF --paper-2x6x2 A5 --print-to-file …\prints
[supervisor] Camera Service start (pid 23652)
[camera] TetraCamera siap di ws://127.0.0.1:61776/ws
[print] printer ready
[print] selesai qeMGWDRmtY
[print] selesai 3RCUWSCrkb
```

- `[boot] camera service: OK` **tidak** muncul. Yang muncul `R-WARN [boot] camera service: tidak terhubung`, karena race health saat boot (M-008 no. 2, belum diperbaiki). Camera Service siap ±0,2 s kemudian dan semua berjalan normal.
- PDF per sesi 73 KB. Geometri sama dengan W-011/W-009: A5, 1 halaman (cetak 1), gambar 1200×1800 di 288×432 pt pada origin.
- `print_jobs`: `done` untuk kedua sesi (perbaikan M-007 berfungsi).

## 2. Bunuh Camera Service 20x

`Stop-Process -Force` pada `TetraCamera.exe` tiap ±5 s selama demo berjalan:
- 20/20 kali muncul PID baru dalam **±0,6 s**.
- Log: 20× `[supervisor] Camera Service berhenti (code 4294967295, signal -)`, 21× `start` (1 awal + 20), 21× `[camera] TetraCamera siap`.
- Demo: 9 sesi sampai `qr` → `attract` tanpa macet.
- Setelah 20x: Camera Service hidup dan `printer ready`. 2 sesi berikutnya tercetak normal.

`print_jobs` setelah uji:

| Sesi | Status | Keterangan |
|---|---|---|
| 7 sesi | `done` | PDF ada |
| `MzusmjjYME` | `failed` `Camera Service tidak terhubung` | `print.submit` jatuh tepat saat Camera Service mati. Renderer: `cetak gagal, sesi tetap lanjut` |
| `fcXfZLaL7X` | **`queued` selamanya** | Diterima Camera Service, lalu proses dibunuh sebelum mencetak. Antrean di memori hilang, tidak ada event, tidak ada coba ulang |

→ **Temuan 1 (M-009):** crash Camera Service bisa menghilangkan print tanpa jejak bagi tamu dan crew. Saran: setelah supervisor melihat `start` + health OK, booth mengirim ulang semua `print_jobs` yang `queued` (dan `failed` karena koneksi) dengan `jobId` yang sama. Adapter idempoten per `jobId`, tapi setelah restart tabel job-nya kosong, jadi job yang sebenarnya sudah tercetak bisa tercetak dua kali. Perlu diputuskan: `queued` yang tidak dikenal Camera Service baru dianggap belum tercetak (risiko cetak ganda kecil, hanya kalau crash tepat setelah spool).

## 3. Proses yatim

- **Tutup normal** (`CloseMainWindow` pada jendela booth): Electron keluar dalam 1 s, `TetraCamera.exe` tersisa **0**.
- **Bunuh paksa semua proses Electron**: `TetraCamera.exe` tersisa **0** setelah 5 s.
- **Bunuh paksa hanya proses utama Electron** (PID 5816, parent `TetraCamera.exe` 21828): `TetraCamera.exe` tersisa **0**.

→ **Temuan 2:** di Windows tidak ada proses yatim. Kemungkinan besar karena libuv (child_process Node/Electron) memasukkan anak ke job object dengan `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, sehingga anak ikut mati saat proses induk mati. Catatan ponytail di `camera-service.ts` hanya relevan di macOS/Linux, atau kalau spawn diubah ke `detached`.

## 4. Build gaya `dist:dev`

- `pnpm exec electron-builder --win --x64 --dir` 48 s, `dotnet publish … -r win-x64 --self-contained` 6 s (restore sudah hangat), disusun jadi `app\booth` + `app\camera`.
- `app\booth\Tetra Booth.exe --camera=simulated --demo --data=… --printer=…`:
  - `[supervisor] C:\Users\USER\TetraBooth\distapp\app\camera\TetraCamera.exe port 62964 …`, jadi binary ditemukan lewat `..\camera\` tanpa flag.
  - `[camera] TetraCamera siap`, `[print] printer ready`, `[print] selesai z6Vk2MHbCM`.
  - Setelah booth dihentikan, `TetraCamera.exe` tersisa 0.

## 5. Event print

| Konfigurasi | Log booth | `print_jobs` | PDF |
|---|---|---|---|
| tanpa `--printer` | `[print] printer unavailable: printer belum dikonfigurasi (--printer)` lalu `[print] GAGAL BMDtsbCZC2: printer_unavailable printer belum dikonfigurasi (--printer)` | `failed`, `printer_unavailable: …` | tidak ada |
| `--paper-2x6x2=TidakAda` | `[print] printer ready` lalu `[print] GAGAL 5f4pJpNB2r: paper_not_supported 2x6x2 butuh nama kertas dari config (--paper-2x6x2); 'TidakAda' tidak ada di driver` | `failed`, `paper_not_supported: …` | tidak ada |
| `--paper-2x6x2=A5` (langkah 1, 4) | `[print] selesai <id>` | `done` | ada |

## 6. Portrait 450×800

Screenshot `capturePage` (gambar simulasi):
- **attract**: "Tetra Booth" di tengah, tombol "SENTUH UNTUK MULAI" satu baris.
- **review**: tiga baris, foto di kiri (±190 px), tombol ULANG di kanan, LANJUT di bawah. Semua muat.
- **print_select**: preview strip, "Mau cetak berapa?", −/1/+, CETAK. Muat dengan ruang di bawah.
- **qr**: QR, teks dua baris, SELESAI.

Angka "1" di print_select masih memakai glyph berkaki (kemungkinan memang bentuk angka 1 Geist). Kecil, bukan masalah layout.

## File diubah

- `docs/reports/windows/2026-09-24-m3-supervisor.md` (baru), `docs/HANDOFF.md`
