# Laporan Windows: verifikasi M2 penyimpanan lokal (W-012)

Tanggal: 2026-09-24 · Basis: `main` @ `ff1e0f0` (M2 + M3 + perbaikan webcam M-006) di-merge ke `win` · Booth dijalankan dari folder `apps\booth` dan men-spawn Camera Service sendiri (M3), dengan `--data=$W\data`.

## Ringkasan

| Langkah | Hasil |
|---|---|
| 1. DB (`sessions`, `assets`, `upload_queue`, `print_jobs`) | **Lulus** |
| 2. Ukuran file output | **Lulus** |
| 3. Booth dibunuh saat countdown → `abandoned` | **Lulus** |
| 4. Log harian main + renderer | **Lulus** |
| 5. Webcam asli | **Lulus.** Sekaligus memverifikasi M-006: raw 2560×1920, capture → preview 138–287 ms |

Temuan untuk Mac: M-008 di HANDOFF (flag printer dengan spasi diabaikan, race health saat boot, `print_jobs` tidak pernah lepas dari `queued`).

## 1. DB `$W\data\db.sqlite`

Demo simulasi 62 s dengan printer (`--printer="Microsoft Print to PDF" --paper-2x6x2=A5 --print-to-file=…`), 2 sesi selesai + 1 sesi terpotong saat booth dihentikan. DB dibaca dengan `electron.exe` + `ELECTRON_RUN_AS_NODE=1` + `node:sqlite` (read-only).

- `journal_mode` = **wal**.
- `sessions`: `sDUdAaUR8u` dan `qmFFnPqhCL` **completed** (photo_count 3, retake 0, print_count 1). Sesi ketiga `in_progress` sampai boot berikutnya (lihat langkah 3).
- `assets`: **9 baris per sesi**: strip ×1, strip_web ×1, thumb_strip ×1, original ×3 (idx 1–3), thumb_original ×3 (idx 1–3).
- `upload_queue` (2 sesi), sesuai TSD §4.2:

| kind | priority | n |
|---|---|---|
| strip_web | 0 | 2 |
| thumb_strip | 0 | 2 |
| original | 1 | 6 |
| strip | 2 | 2 |
| thumb_original | 2 | 6 |

- `print_jobs`: 2 baris `queued`, copies 1, paper `2x6x2`, attempts 1, tanpa error. PDF terbentuk di `$W\prints` untuk kedua sesi (72–73 KB). Status tetap `queued` karena booth belum menerima `print.done` (M-007 no. 1 / M-008 no. 3).

## 2. Ukuran file (`sessions\<id>\out`)

| File | Simulasi (raw 3000×2000) | Webcam (raw 2560×1920) | Syarat |
|---|---|---|---|
| strip.jpg | 1200×1800 | 1200×1800 | 1200×1800 |
| strip_web.jpg | 600×1800 | 600×1800 | 600×1800 |
| original_1..3.jpg | 2400×1600 | 2400×1800 | sisi panjang ≤ 2400, tidak diperbesar |
| thumb_original_1..3.jpg | 480×320 | 480×360 | sisi panjang 480 |
| thumb_strip.jpg | 160×480 | 160×480 | sisi panjang 480 |

`[session] selesai <id>: 9 aset, 278–442 ms` (simulasi), 432 ms (webcam), dikerjakan di belakang layar setelah compose.

## 3. Booth dibunuh saat countdown

`Stop-Process -Force` pada booth tepat setelah `[phase] countdown` (sesi `NZqGT9unEh`), lalu start lagi:

```
[boot] Tetra Booth 0.0.1 · data C:\Users\USER\TetraBooth\data · sesi terputus ditandai: 1
```

DB: `NZqGT9unEh` dan sesi terpotong dari langkah 1 (`2KtaB95UfK`) sama-sama `abandoned`, `completed_at` null.

Catatan: setiap kali booth dibunuh paksa, `TetraCamera.exe` anaknya ikut kubersihkan manual. Perilaku proses yatim diuji di W-013.

## 4. Log harian `$W\data\logs\2026-09-24.log`

149 baris setelah langkah 1–3: 92 baris main (`INFO`/`ERROR`: `[boot]`, `[supervisor]`, `[camera]`, `[phase]`) dan 54 baris `R-INFO` + 3 `R-WARN` dari renderer. Format `2026-09-24T08:31:01.456Z INFO [boot] …`.

Ketiga `R-WARN` (dan `ERROR` di main) berasal dari **race saat boot**. Renderer memanggil `health` ±200 ms setelah spawn, sementara Camera Service (`dotnet` Debug) baru siap ±0,5 s kemudian:

```
08:31:01.494Z INFO  [supervisor] Camera Service start (pid 18740)
08:31:01.705Z ERROR Error occurred in handler for 'health': Error: Camera Service tidak terhubung
08:31:01.708Z R-WARN [boot] camera service: tidak terhubung (…)
(Camera Service siap sesudahnya, sesi & print berjalan normal)
```

Jadi setiap boot di Windows mencatat "tidak terhubung" walaupun sebenarnya tidak ada masalah (M-008 no. 2).

## 5. Webcam (`--camera=webcam --demo`)

- Log: `[webcam] 2560×1920, foto: frame video`. Perbaikan M-006 aktif.
- `raw/1..3.jpg` **2560×1920** (621–692 KB), dibandingkan 1920×1080 di W-011 sebelum perbaikan.
- Capture → preview dari timestamp log fase: **287 / 138 / 204 ms** (W-011 sebelum perbaikan: 433–1259 ms). Target ≤ 2 s.
- Compose 151 ms, selesai (9 aset) 432 ms.
- Foto tidak dibuka. Hanya ukuran yang dicatat. `$W\data` sudah dihapus.

## Catatan lingkungan

- Flag booth hanya membaca bentuk `--flag=value`. `--printer "Microsoft Print to PDF"` (bentuk dengan spasi, seperti contoh di WINDOWS.md §5 dan W-013) **diabaikan tanpa pesan**, sehingga booth jalan tanpa printer. Di sini aku memakai bentuk `=`.
- Beberapa uji sebelumnya (probe webcam, booth tanpa `--data`, build W-007) sempat membuat folder di `%APPDATA%`. Store pnpm 12 dan cache NuGet/electron-builder juga masuk `%LOCALAPPDATA%`, karena env di `env.ps1` tidak dibaca tool versi ini. Folder userData app milikku sudah dihapus. Rincian cache dan rencana bersih-bersih ada di ringkasan untuk Rama.
