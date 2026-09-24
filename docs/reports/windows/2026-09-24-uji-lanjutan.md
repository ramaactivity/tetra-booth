# Laporan Windows: uji lanjutan (W-005..W-007)

Tanggal: 2026-09-24 · Mesin: laptop Windows pinjaman (HP EliteBook 830 G9, i7-1255U, 16 GB, Win 11 21H2, scaling 150%) · Branch: `win` · Basis kode: `main` @ `becd71a` + `3cccbbd`

## Ringkasan

| Tugas | Hasil |
|---|---|
| W-005 `update.cmd` dari R2 | **Terblokir, belum diuji.** Permission Claude Code di laptop ini menolak mengunduh lalu menjalankan skrip dari luar repo. Butuh keputusan Rama |
| W-006 Riset printer | Selesai ke "Microsoft Print to PDF". Tidak ada DNP. Temuan penting untuk `WindowsPrinterAdapter` di bawah |
| W-007 Performa | Selesai pada **build lokal setara** `dist:dev` (bukan zip R2). Semua angka jauh di bawah target yang relevan |

## W-005 Uji `update.cmd`: terblokir

Perintah yang ditolak: `Invoke-WebRequest …/dev-builds/update.cmd -OutFile $W\devbuild\update.cmd`. Mode auto Claude Code menolaknya dengan alasan "Code from External" (skrip dari luar repo yang akan dijalankan). Tidak ada yang diunduh atau dijalankan. Aku tidak mencari jalan memutar.

Supaya W-007 tetap bisa berjalan, aku membuat build yang sama secara lokal dengan langkah [1/4] dan [2/4] `scripts/dist-dev.mjs`, tanpa upload:

| Langkah | Durasi | Ukuran |
|---|---|---|
| `pnpm exec electron-builder --win --x64 --dir --publish never` | 97 s | `win-unpacked` 336 MB |
| `dotnet publish TetraCamera.Host -c Release -r win-x64 --self-contained` | 60 s | 105 MB |

Build lokal berjalan normal dari `Tetra Booth.exe` + `TetraCamera.exe --port 8765 --token dev` (setara `run.cmd`). Health OK dan hash sama (lihat W-007). Yang **belum** teruji: unduhan zip dari R2, ekstraksi oleh `update.cmd`, dan peringatan SmartScreen/Defender untuk file dari internet (Mark-of-the-Web).

Opsi agar W-005 bisa jalan: (a) Rama mengizinkan aksi ini di Claude Code laptop ini (aturan permission), atau (b) `update.cmd` di-commit ke repo sebagai `tools/windows/update.cmd` versi final, lalu dijalankan dari repo. Zip-nya tetap diunduh dari R2, dan ini perlu dicek apakah juga diblokir.

## W-006 Riset printer (dasar desain `WindowsPrinterAdapter`)

Metode: skrip PowerShell sementara (tidak di-commit) memakai `System.Drawing.Printing.PrintDocument` → "Microsoft Print to PDF", `PrintToFile=true` + `PrintFileName` (tanpa dialog), `StandardPrintController`. Gambar uji 1200×1800 px (border 1 px, penanda sudut 100 px, garis tengah) digambar `DrawImage(img, 0, 0, 400, 600)` dalam `PageUnit=Display` (1/100 in) setelah `TranslateTransform(-HardMarginX, -HardMarginY)`. PDF hasil dianalisis langsung (MediaBox, XObject gambar, matriks `cm`).

### Setelan yang terbaca

| Kasus | PaperSize | Margins | PrintableArea | HardMargin | Bounds | Resolusi | PDF MediaBox |
|---|---|---|---|---|---|---|---|
| Default | Letter (kind=Letter raw=1) 850×1100 | 100 semua sisi | 0,0,850,1100 | 0,0 | 850×1100 | Custom 600×600 | 612×792 pt (Letter) |
| **Custom 4×6** (`new PaperSize("4x6",400,600)`, margin 0) | Custom raw=0 400×600 | 0 | **0,0,850,1100** | 0,0 | 400×600 | 600×600 | **612×792 pt (Letter)** |
| A5 (dari `PaperSizes`), margin 0 | A5 raw=11 583×827 | 0 | 0,0,582.67,826.83 | 0,0 | 583×827 | 600×600 | 419,52×595,32 pt (A5) |

Lainnya: `SupportsColor=true`, `CanDuplex=false`, `MaximumCopies=1`, `Graphics.DpiX/Y=600` di `PrintPage`. `PrintController` standar: 2,0–3,9 s per `Print()`.

### Temuan

1. **Print to PDF tidak punya 4×6 dan mengabaikan PaperSize custom.** `PageBounds` di event `PrintPage` melaporkan 400×600, tapi `PrintableArea`, clip, dan PDF hasilnya tetap Letter. Jadi `PageBounds` tidak bisa dipercaya untuk memastikan ukuran kertas yang benar-benar dipakai driver. Ukuran yang dihormati driver hanya yang ada di `PrinterSettings.PaperSizes` (terbukti dengan A5).
   → `WindowsPrinterAdapter` harus **memilih PaperSize dari daftar driver** (cocokkan nama/ukuran, misalnya DNP `(4x6)` / `PC 4x6`), bukan membuat PaperSize custom. Validasi hasilnya lewat `PrintableArea`, bukan `PageBounds`. Kalau tidak ada yang cocok → `print.failed` dengan alasan jelas, jangan diam-diam mencetak ke Letter.
2. **Penempatan presisi tanpa scaling:** gambar mendarat di 288×432 pt = **tepat 4×6 inci** di pojok kiri atas (matriks `0.75 0 0 -0.75 0 792 cm` × `384×576` unit 96 dpi). HardMargin Print to PDF = 0, jadi tidak ada offset. Untuk printer fisik, `TranslateTransform(-HardMarginX, -HardMarginY)` wajib agar origin = tepi kertas.
3. **Resolusi utuh, tapi dikompres ulang:** driver memecah gambar jadi 3 pita 1200×600 (total 1200×1800 px = 300 dpi pada 4×6), tanpa downsampling, tetapi di-encode ulang sebagai **JPEG (DCTDecode)**. Uji "PDF 1200×1800 tepat tanpa scaling" (M4) lulus secara geometri. Perbandingan hash piksel dengan PDF tidak mungkin karena lossy.
4. Uji ke PDF dengan kertas 4×6 (target M4) **tidak bisa dilakukan** dengan Print to PDF bawaan. Pilihan untuk M4: uji geometri di Letter/A5 (gambar 4×6 di pojok) seperti di atas, atau pasang driver DNP (butuh admin, melanggar aturan laptop pinjaman) di mesin lain.
5. DNP tidak terpasang dan tidak ada perangkat USB DNP, jadi tidak ada data DNP.

## W-007 Performa (build lokal)

### Start aplikasi

Camera Service self-contained dijalankan dulu, lalu `Tetra Booth.exe --enable-logging`. Diukur dari `Start-Process` sampai baris log muncul.

| Run | Camera Service listen | Start → `[fase0] engine hash` | Start → `camera service: OK` |
|---|---|---|---|
| 1 (cold) | 594 ms | 1086 ms | 1214 ms |
| 2 | 583 ms | 465 ms | 544 ms |
| 3 | 604 ms | 437 ms | 527 ms |

Hash selalu `ae20f38c…d4835f7`, sama dengan snapshot 4R. Sebagai pembanding, W-002 (Electron dev, bukan paket) mencatat 741 ms / 850 ms.

### Render fixture 4R

`performance.now()` sementara di `EngineCheck.tsx` (sudah di-revert, tidak di-commit), 11× `render()` per launch, 2 launch:

| Ukuran | Launch 1 | Launch 2 |
|---|---|---|
| `makeFixtureInputs` pertama | 22,3 ms | 24,5 ms |
| `render()` pertama | 2,1 ms | 2,0 ms |
| `render()` median 10 berikutnya | 0,2 ms | 0,2 ms |
| `pixelHash(out)` (readback + SHA-256) | 161 ms | 185 ms |

Catatan jujur: `render()` 0,2 ms hanya mengukur perekaman perintah OffscreenCanvas. Rasterisasi baru terjadi saat piksel dibaca, jadi biaya compose nyata ≈ render + readback, **±160–185 ms**, masih termasuk hashing. Fixture memakai blok warna, bukan foto. Compose dengan 4 JPEG 18–24 MP (decode + resize) akan jauh lebih berat, jadi angka ini belum membuktikan target 1,5 s untuk sesi nyata. Perlu diukur ulang di M2 dengan foto asli.

### RAM setelah 5 menit idle (run 3, layar Attract)

| Proses | Jumlah | Working set | Private | CPU total |
|---|---|---|---|---|
| Tetra Booth (Electron: main, GPU, utility, renderer) | 4 | 219,4 MB | 166,6 MB | 3,0 s |
| TetraCamera (self-contained) | 1 | 38,5 MB | 17,8 MB | 0,5 s |
| **Total** | | **257,9 MB** | **184,4 MB** | |

Handles: Electron 297/304/863/502, TetraCamera 436. CPU hampir nol saat idle.

### Dibanding target 03-TSD §14

| Target | Nilai | Hasil |
|---|---|---|
| Compose strip ≤ 1,5 s | fixture 4R ±0,16–0,19 s | Lulus untuk fixture, **belum** untuk foto asli |
| Live view ≥ 20 fps | – | Belum bisa diukur (belum ada live view, kamera belum ada) |
| Capture → tampil ≤ 2 s | – | Belum bisa diukur |
| Foto terakhir → print ≤ 20 s | – | Belum bisa diukur. `Print()` ke PDF 2–4 s |

§14 belum punya target waktu start atau RAM. Usul: start ≤ 3 s dan RAM idle ≤ 500 MB sebagai batas awal untuk M8 (deteksi leak).

## File diubah

- `docs/reports/windows/2026-09-24-uji-lanjutan.md` (baru)
- `docs/HANDOFF.md` (W-006..W-008 dicentang, W-005 ditandai terblokir, log)

Skrip sementara (`$W\scratch\w006-*.ps1`, `w007-start.ps1`) dan perubahan `EngineCheck.tsx` tidak di-commit.
