# Laporan Windows: bootstrap (W-001..W-003)

Tanggal: 2026-09-24 · Mesin: laptop Windows pinjaman · Branch: `win` · Basis: `main` @ `becd71a`

## Ringkasan

| Tugas | Hasil |
|---|---|
| W-001 Verifikasi repo | **Lulus** setelah satu perbaikan `pnpm-workspace.yaml` (lihat Masalah 1) |
| W-002 Smoke test booth + Camera Service | **Lulus**. Hash 4R sama dengan snapshot, Camera Service OK, layar Attract tampil |
| W-003 Inventaris hardware | Selesai. Tidak ada kamera Canon atau printer DNP. Ada webcam internal |

## Toolchain (portable, tanpa admin, semua di `%USERPROFILE%\TetraBooth`)

| Tool | Versi | Catatan |
|---|---|---|
| Node | v24.21.0 win-x64 | SHA256 diverifikasi terhadap `SHASUMS256.txt` |
| pnpm | 12.6.0 | `npm i -g`. npm melewati install script pnpm (allowScripts), tetap berfungsi |
| .NET SDK | 10.0.401 | `dotnet-install.ps1 -Channel 10.0` |
| Git | MinGit 2.55.0.windows.5 | digest SHA256 dari GitHub release cocok |
| Electron | 44.4.3 | zip 151 MB di `.electron-cache` |

## W-001 Verifikasi repo

| Langkah | Hasil | Durasi |
|---|---|---|
| `pnpm install --frozen-lockfile` (cold, store kosong) | 601 paket. **Gagal** pertama kali (`ERR_PNPM_IGNORED_BUILDS`), lulus setelah perbaikan | 309 s (jaringan lambat, banyak tarball <50 KiB/s) |
| Unduh biner Electron (`node install.js` manual, lihat Masalah 1) | OK | 111 s |
| `pnpm lint` (Biome) | Lulus, 79 file | 1 s |
| `pnpm typecheck` (8 task) | Lulus | 4,8 s |
| `pnpm test` (5 task) | Lulus: ui 4, booth-core 1, shared 10, template-engine 5, db 6 (RLS, embedded Postgres windows-x64) | 11,5 s |
| `dotnet test services/camera` | Lulus 4/4 | 28,2 s (termasuk restore + build pertama) |

Baris `ERROR: new row violates row-level security policy` di log test db memang diharapkan: test-nya memastikan RLS menolak insert.

Tidak ada masalah path, CRLF, atau native module. `@embedded-postgres/windows-x64` dan `esbuild` postinstall berjalan normal.

## W-002 Smoke test

- Build: `pnpm --filter booth build` 1 s. `dotnet build TetraCamera.Host` 3,6 s, 0 warning.
- Camera Service (`dotnet run --no-build … --port 8765 --token dev`): mendengarkan di port 8765 kurang dari 0,5 s setelah start. Log: `TetraCamera siap di ws://127.0.0.1:8765/ws`.
- Booth (`electron.exe apps\booth\out\main\index.js --enable-logging`):
  - `[fase0] engine hash: ae20f38c39b95ccb068a60bff257748f39a01fe3d8beb4f3dd35d00e6d4835f7` **sama** dengan snapshot 4R.
  - `[fase0] camera service: OK · kamera disconnected · printer unavailable`.
  - Waktu start: 0,74 s dari `Start-Process` sampai hash tercatat, 0,85 s sampai health OK (cold start pertama).
- Screenshot jendela: judul "Tetra Booth", teks "SENTUH UNTUK MULAI" di tombol merah, font sans (Geist), panel dev kiri bawah menampilkan thumbnail strip 4R + hash + status Camera Service. Jendela 1920×1080 px fisik (1280×720 logis pada scaling 150%). Screenshot sudah dihapus.

## W-003 Inventaris hardware

| Item | Nilai |
|---|---|
| Model | HP EliteBook 830 13 inch G9 |
| Windows | Windows 11 Pro 21H2, build 22000.2538, 64-bit |
| CPU | Intel Core i7-1255U, 10 core / 12 thread |
| RAM | 15,6 GB (bebas ±5,7 GB saat diukur) |
| Disk | C: 140,2 GB bebas dari 280,9 GB · D: 185,1 GB bebas dari 195,3 GB |
| GPU | Intel Iris Xe |
| Layar | 1 layar internal (AUO, 29×18 cm), 1920×1200 @60 Hz, **scaling 150%** (1280×800 logis) |
| Touchscreen | **Tidak ada** (`SM_DIGITIZER=0`; hanya touchpad HID) |
| Webcam | **HP 5MP Camera** (`USB\VID_04F2&PID_B738&MI_00`) + HP IR Camera |
| USB Canon/EOS/DNP/Nikon/Sony | Tidak ada |

### Printer (`Get-Printer`)

| Nama | Driver | Port |
|---|---|---|
| OneNote (Desktop) | Send to Microsoft OneNote 16 Driver | `nul:` |
| Microsoft XPS Document Writer | Microsoft XPS Document Writer v4 | `PORTPROMPT:` |
| Microsoft Print to PDF | Microsoft Print To PDF | `PORTPROMPT:` |
| Fax | Microsoft Shared Fax Driver | `SHRFAX:` |

Tidak ada printer DNP.

### `PaperSizes` "Microsoft Print to PDF" (`System.Drawing.Printing.PrinterSettings`)

Default: Letter. Satuan 1/100 inci.

| PaperName | Kind | RawKind | Ukuran |
|---|---|---|---|
| Letter | Letter | 1 | 850×1100 (8,50×11,00 in) |
| Tabloid | Tabloid | 3 | 1100×1700 (11,00×17,00 in) |
| Legal | Legal | 5 | 850×1400 (8,50×14,00 in) |
| Statement | Statement | 6 | 550×850 (5,50×8,50 in) |
| Executive | Executive | 7 | 725×1050 (7,25×10,50 in) |
| A3 | A3 | 8 | 1169×1654 (11,69×16,54 in) |
| A4 | A4 | 9 | 827×1169 (8,27×11,69 in) |
| A5 | A5 | 11 | 583×827 (5,83×8,27 in) |
| B4 (JIS) | B4 | 12 | 1012×1433 (10,12×14,33 in) |
| B5 (JIS) | B5 | 13 | 717×1012 (7,17×10,12 in) |

Resolusi: High/Medium/Low/Draft (nilai negatif = preset driver), Custom 600×600. **Tidak ada 4×6** di Print to PDF.

## Masalah & perbaikan

1. **`pnpm install --frozen-lockfile` gagal di Windows.** `pnpm-workspace.yaml` berisi placeholder `electron-winstaller: set this to true or false` di `allowBuilds`. pnpm 12.6.0 berhenti dengan `ERR_PNPM_IGNORED_BUILDS: Ignored build scripts: electron-winstaller@5.4.0` **sebelum** postinstall Electron jalan, jadi `electron.exe` tidak terunduh.
   - Perbaikan (commit `3cccbbd` di `win`): `electron-winstaller: false`. Booth memakai target `zip` (rencana NSIS), bukan Squirrel, jadi script itu tidak dibutuhkan.
   - Efek samping: setelah install gagal, `pnpm install` atau `pnpm rebuild electron` berikutnya menganggap Electron sudah terpasang dan tidak mengunduh biner. Harus menjalankan `node install.js` di `apps/booth/node_modules/electron`. Install bersih setelah perbaikan tidak kena masalah ini.
2. Screenshot layar penuh (WINDOWS.md §5) di laptop pinjaman bisa menangkap jendela pribadi pemilik laptop yang sedang terbuka. Sekarang aku hanya menangkap jendela Electron dengan `PrintWindow` (skrip lokal di `$W`, tidak di-commit). Proses PowerShell harus DPI-aware (`SetProcessDPIAware`) karena scaling 150%. Kalau tidak, gambarnya terpotong.
3. Kosmetik: PowerShell 5.1 membungkus stderr pnpm jadi `NativeCommandError` walaupun exit 0. Log UTF-8 Electron yang dibaca `Get-Content` tanpa `-Encoding UTF8` menampilkan `â€¦`. Aplikasinya tidak bermasalah.

## Saran

- Merge commit `3cccbbd` ke `main`. Mac kemungkinan tidak kena karena store pnpm sudah hangat, tapi CI dan mesin baru akan kena.
- WINDOWS.md §5: ganti "screenshot layar utama" jadi "screenshot jendela aplikasi saja (PrintWindow, DPI-aware)".
- Kamera: belum ada Canon. Arahan Rama (2026-09-24): uji kamera sementara pakai webcam (HP 5MP Camera), uji Canon/EDSDK di fase berikutnya.
- Laptop ini tidak punya touchscreen dan scaling-nya 150%. Uji layout booth di 1280×800 logis, dan uji sentuh harus di hardware booth.
- Jaringan laptop lambat (tarball <50 KiB/s). Install cold ±7 menit termasuk Electron.

## File diubah

- `pnpm-workspace.yaml` (allowBuilds `electron-winstaller: false`)
- `docs/reports/windows/2026-09-24-bootstrap.md` (baru)
- `docs/HANDOFF.md` (W-001..W-004 dicentang, log, catatan untuk Mac)
