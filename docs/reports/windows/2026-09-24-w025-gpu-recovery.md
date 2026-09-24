# W-025 Uji ulang pemulihan GPU di build M-018

Tanggal: 2026-09-24 · laptop booth Rama (Intel UHD 32.0.101.7088) · basis `win` = `main@417ae02` (watchdog layar + relaunch lewat close guard kiosk) · booth dev `--camera simulated`, Print to PDF. `pnpm typecheck/test` lulus, e2e 4/4.

## Ringkasan

- **Di attract: 11/11 pulih** (6× `--kiosk`, 5× tanpa). Deteksi ±0,4 s (Electron melihat GPU mati) atau ±12,9 s (watchdog). Boot ulang 0,7–13,4 s setelah kill. Setiap kali main baru `Responding=True`, `camera service: OK`, attract tampil, dan **klik mouse sungguhan** di "Sentuh untuk Mulai" memulai countdown.
- **Di tengah sesi (countdown): 6 percobaan.**
  - 4× layar beku → watchdog relaunch pada 15,3 s, sesi ditandai terputus (`sesi terputus ditandai: 1`), booth kembali normal.
  - 2× Electron melihat GPU mati dan Chromium menyalakan ulang GPU sendiri → sesi **berlanjut normal** (review → compose → print_select), relaunch dijadwalkan untuk saat kembali ke attract. Tetapi **`print_select` tidak punya timeout**, jadi tanpa tamu booth tertahan di layar pilih jumlah cetak (> 5 menit, tetap di sana) dan relaunch tidak pernah terjadi. Temuan M-019.
- Main **tidak pernah `Not Responding`**. Tidak ada kasus yang tidak pulih di attract.

## Cara uji

`C:\TetraBooth\scratch\gpukill3.cjs` (tidak di-commit):
1. Booth diluncurkan dengan Playwright-Electron (data baru tiap percobaan), attract, tunggu 2 s. Untuk "tengah sesi", klik mulai lalu tunggu 2,5 s (countdown).
2. `taskkill /F /PID <GPU dari app.getAppMetrics()>`.
3. Pantau log untuk `[gpu] proses GPU mati` / `[watchdog]` dan `[boot]` kedua (batas 90 s, lalu 300 s untuk tengah sesi).
4. Setelah boot kedua: cek log instance baru (`camera service: OK`, `[phase] attract`) dan `Get-Process … Responding`. Lalu klik mouse Win32 (`SetCursorPos` + `mouse_event`) di posisi tombol mulai (20%/77% area klien) dan cek `[phase] countdown` di instance baru.

## Hasil

"Deteksi" = pemicu pertama. Pada k3–k5/n1/n2/n4/n5, `[watchdog]` tercatat ±70 ms sebelum `[gpu] proses GPU mati`: Electron baru melihat GPU mati saat booth sudah relaunch, dan skrip menandai keduanya dalam satu polling.

| # | Kiosk | Fase saat kill | Pemicu | Deteksi | Boot ulang | Setelahnya |
|---|---|---|---|---|---|---|
| k1 | ya | attract | `[gpu]` (killed) | 0,4 s | 0,7 s | attract OK, klik → countdown |
| k2 | ya | attract | `[gpu]` | 0,5 s | 0,8 s | OK |
| k3 | ya | attract | `[watchdog]` lalu `[gpu]` | 12,9 s | 13,1 s | OK |
| k4 | ya | attract | watchdog | 13,0 s | 13,2 s | OK |
| k5 | ya | attract | watchdog | 12,9 s | 13,2 s | OK |
| k6 | ya | attract | watchdog | 12,8 s | 13,4 s | OK |
| n1 | tidak | attract | watchdog | 12,9 s | 13,2 s | OK |
| n2 | tidak | attract | watchdog | ±12,9 s | ±13,2 s | OK |
| n3 | tidak | attract | watchdog | 12,8 s | 13,4 s | OK |
| n4 | tidak | attract | watchdog | 12,9 s | 13,2 s | OK |
| n5 | tidak | attract | watchdog | 12,9 s | 13,2 s | OK |
| km | ya | countdown | watchdog | 15,3 s | 15,5 s | sesi terputus 1, attract OK, klik → countdown |
| nm2 | tidak | countdown | watchdog | 15,3 s | 15,6 s | sama |
| nm3 | tidak | countdown | watchdog | 15,3 s | 15,5 s | sama |
| nm4 | tidak | countdown | watchdog | 15,4 s | 15,6 s | sama |
| nm | tidak | countdown | `[gpu]` | 0,5 s | — (90 s) | sesi lanjut ke print_select, menunggu |
| nm5 | tidak | countdown | `[gpu]` | 0,5 s | — (300 s) | review 16:47:57 → print_select 16:48:17, **tertahan** (log tidak bertambah sampai 16:52+) |

- Di attract, watchdog mendeteksi ±12,9 s setelah kill (bukan 15 s), karena frame terakhir sudah ±2 s sebelum kill di layar yang sepi.
- Di countdown ±15,3 s.
- Kiosk: relaunch tidak tertahan close guard (bug M-018 no. 2 terbukti beres).

## Temuan untuk Mac (M-019)

1. **`print_select` tanpa timeout** (mode event). Setelah GPU pulih sendiri di tengah sesi (Chromium restart GPU, `[gpu]` → relaunch dijadwalkan), sesi berjalan terus. Kalau tamu pergi, booth tertahan di layar pilih jumlah cetak dan relaunch tidak pernah terjadi. Booth juga mungkin tetap di software compositing (lambat, W-020 run ke-2). Hal yang sama berlaku tanpa kasus GPU: tamu meninggalkan booth di print_select → booth tidak pernah kembali ke attract. Review sudah maju sendiri setelah 20 s. Usul: timeout print_select (mis. 30–60 s → cetak jumlah default atau lewati cetak → QR → attract), atau relaunch pending boleh jalan setelah N menit tanpa input.
2. Info: di run ini tidak ada kasus main `Not Responding`. Watchdog di luar main (usulan M-018 no. 2) belum teruji karena kasus run ke-1 W-020 (update driver sungguhan) tidak bisa direproduksi dengan `taskkill`.

## Bersih-bersih

`C:\TetraBooth\w025` dihapus. Tidak ada perubahan kode.
