# W-021 Setup laptop booth Rama + verifikasi dasar (profil A)

Tanggal: 2026-09-24 · Mesin: laptop booth Rama · Branch `win` (merge `origin/main` 5097faf)

## Ringkasan

- Semua pemeriksaan kode lulus: lint, typecheck, 67 test TS, 71 test C#, e2e 4/4.
- DNP RX1HS terdeteksi dengan driver resmi `DS-RX1` 1.2.3.0 yang sudah terpasang. Tidak ada driver yang dipasang.
- **Temuan penting untuk Mac (M-014):**
  1. Ukuran 4×6 di driver DNP 413×615 (overscan borderless). Karena itu `PaperSelector` tanpa config gagal (`paper_not_supported`).
  2. Adapter menggambar tepat 400×600 di (0,0) pada halaman 614,67×413,33, jadi diduga ada tepi putih kanan/bawah.
  3. Pemotongan 2 inci adalah fitur driver `CUTTERCONTROL`, bukan ukuran kertas.
- Canon 60D terdeteksi (`Canon EOS 60D`, WPD), tetapi berstatus **Error `CM_PROB_FAILED_START`** (Code 10). EOS Utility belum terpasang.

## 1. Tool & verifikasi kode

Tool dipasang permanen lewat winget: Git 2.55.0, gh 2.101.0, Node 24.19.0, .NET SDK 10.0.401 (sebelumnya hanya runtime), pnpm 12.6.0 (`npm i -g`). Login GitHub lewat `gh auth login` (akun ramaactivity).

| Langkah | Hasil | Durasi |
|---|---|---|
| `pnpm install --frozen-lockfile` (store kosong, jaringan lambat ±20–50 KiB/s untuk tarball kecil) | OK, 616 paket | 92 s |
| `pnpm lint` | OK | 2 s |
| `pnpm typecheck` | OK (8 task) | 7 s |
| `pnpm test` | OK: ui 4, shared 14, booth-core 12, booth 26, template-engine 5, db (RLS, embedded Postgres) 6 = 67 | 11 s |
| `dotnet build services/camera` | OK | 17 s |
| `dotnet test services/camera` | OK 71/71 | 13 s |
| `pnpm --filter booth build` | OK | 1 s |
| `pnpm --filter booth e2e` (termasuk unduh Electron) | OK 4/4 (crew 4,9 s, kiosk crash 4,6 s, kiosk keluar 1,8 s, hot folder 19,7 s) | 45 s |

Baris `ERROR: new row violates row-level security policy` di log db adalah perilaku yang memang diuji, bukan kegagalan.

## 2. Spesifikasi laptop

| | |
|---|---|
| Model | HP ProBook 440 14 inch G9 |
| Windows | 11 Pro 10.0.22621 (22H2) |
| CPU | Intel Core i7-1255U (10 core / 12 thread) |
| RAM | 15,6 GB |
| Disk C | 147 GB kosong dari 271 GB |
| Layar | 1 layar internal 1920×1080, scaling 150% (logis 1280×720), 31×17 cm |
| GPU | Intel UHD Graphics |
| Touchscreen | tidak ada |
| Webcam | HP HD Camera |

## 3. Printer

| Nama | Driver | Port | Status |
|---|---|---|---|
| `DS-RX1` | `DS-RX1` 1.2.3.0 (Unidrv v3, GPD `DSRX1.GPD`, paket driver 12/16/2024) | USB001 | Normal (**perangkat yang terhubung**, PnP `USB\VID_1343&PID_0005\CB2D57192208`) |
| `DS-RX1 (Copy 1)` | sama | USB002 | Normal (antrean sisa dari colokan lain; port tidak aktif sekarang) |
| Microsoft Print to PDF | | PORTPROMPT: | Normal |
| OneNote (Desktop) | | nul: | Normal |

Pakai **`DS-RX1`**. Antrean `(Copy 1)` dibiarkan (tidak diubah).

### PaperSizes DNP (`DS-RX1`, sama dengan Copy 1)

Default: `(6x4)`, portrait. Resolusi: 300×300 (default), 300×600, 600×600. `MaxCopies: 1` di GPD. Semua ukuran `HardMargin 0,0`, `PrintableArea` = ukuran kertas (MarginOff default).

| Nama persis | 1/100 in | RawKind | PrintableArea | Opsi GPD (600 dpi) |
|---|---|---|---|---|
| `PR (3.5x5)` | 363×516 | 119 | 362,67×516 | PR_L 2176×3096 |
| `PR (3.5x5) x 2` | 363×516 | 120 | 362,67×516 | PR_35x5x2 |
| `PR (4x6)` | 413×615 | 121 | 413,33×614,67 | PR_4x6 2480×3688 |
| `PR (4x6) x 2` | 413×615 | 122 | 413,33×614,67 | PR_4x6x2 |
| `(5x3.5)` | 516×363 | 123 | 516×362,67 | L 3096×2176 |
| `(6x4)` | 615×413 | 124 | 614,67×413,33 | PC 3688×2480 |
| `(5x7)` | 516×713 | 125 | 516×712,67 | 2L 3096×4276 |
| `(6x8)` | 615×812 | 126 | 614,67×812 | A5STD 3688×4872 |
| `(6x4) x 2` | 615×413 | 127 | 614,67×413,33 | 6x4x2 |
| `(5x3.5) x 2` | 516×363 | 128 | 516×362,67 | 5x35x2 |
| `(5x5)` | 516×513 | 129 | 516×513,33 | 5x5 |
| `(6x6)` | 615×612 | 130 | 614,67×612 | 6x6 |

Fitur driver lain (GPD, `DOC_PROPERTY`, terlihat di PrintTicket default antrean):

```
ns0000:DocumentPrintMargin    = MarginOff        (MarginOn: area cetak 3448×2240 origin 120,120)
ns0000:DocumentOVERCOATTYPE   = OPTYPE_LUSTER    (atau OPTYPE_MATTE1)
ns0000:DocumentCUTTERCONTROL  = CUT_STANDARD     (atau CUT_2INCH  ← "2x6 cut")
psk:PageMediaSize             = ns0000:PC        = (6x4)
```

## 4. PaperSelector terhadap daftar DNP

Dijalankan dengan kode asli `TetraCamera.Print` (file-based app sementara, tidak di-commit):

```
4R tanpa config:     GAGAL paper_not_supported: tidak ada kertas 4x6 di driver
2x6x2 tanpa config:  GAGAL paper_not_supported: 2x6x2 butuh nama kertas dari config (--paper-2x6x2)
4R '(6x4)':          '(6x4)' 615x413, PrintableAreaMatches=True
4R 'PR (4x6)':       'PR (4x6)' 413x615, PrintableAreaMatches=True
2x6x2 '(6x4)':       '(6x4)' 615x413, PrintableAreaMatches=True
```

`IsFourBySix` memakai toleransi ±2, sedangkan DNP 4×6 = 413×615 (+13/+15). Jadi 4R tanpa config tidak menemukan kertas.

**Usulan config W-022:** `--printer "DS-RX1" --paper-4r "(6x4)" --paper-2x6x2 "(6x4)"`. `(6x4)` adalah default driver (opsi `PC`, arah umpan asli). Adapter memutar gambar untuk kertas melebar. `PR (4x6)` (portrait) juga lolos validasi. Perbedaan hasilnya baru bisa dipastikan lewat cetak fisik.

## 5. Dugaan masalah geometri (belum dicetak, diuji di W-022)

`WindowsPrinterAdapter` menggambar gambar tepat `600×400` (1/100 in) di origin kertas. Halaman DNP `(6x4)` berukuran **614,67×413,33**: 4×6 plus overscan supaya hasil borderless. Akibatnya kolom 14,67 dan baris 13,33 (≈3,7 mm × 3,4 mm) di kanan/bawah tidak tergambar. Kalau overscan DNP simetris, hasil fisik 4×6 akan terpotong ±1,8 mm di kiri/atas dan **bertepi putih ±1,8 mm di kanan/bawah**. Belum ada lembar yang dicetak untuk membuktikan ini. Usulan perbaikan untuk Mac ada di M-014 di HANDOFF.

## 6. Kamera

- `Get-PnpDevice`: `Canon EOS 60D` · class WPD · `USB\VID_04A9&PID_3215\5&2EE9C910&0&3` · **Status Error, `CM_PROB_FAILED_START`** (Code 10). `pnputil /restart-device` ditolak (butuh admin). Biasanya pulih kalau kamera dimatikan–dinyalakan lalu kabel dicolok ulang. Rama diminta melakukannya.
- EOS Utility: **belum terpasang** (tidak ada entri Canon di Uninstall registry). Hanya paket driver DNP yang terdaftar.
- Canon EDSDK: tidak dipakai (WINDOWS.md §0.1 no. 6).

## 7. Lain-lain

- Keep-awake: `C:\TetraBooth\keep-awake.ps1` (`SetThreadExecutionState`) jalan tersembunyi.
- `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` diset. Shell Claude Code sendiri memakai `Bypass` di scope proses.
- File sementara (tidak di-commit): `C:\TetraBooth\inventory.ps1`, `C:\TetraBooth\run-steps.ps1`, `C:\TetraBooth\scratch\selcheck.cs`, log di `C:\TetraBooth\logs`.
