# Laporan Windows: verifikasi M-011 + M7 hot folder (W-017)

Tanggal: 2026-09-24 · Basis: `main` @ `b8d8548` (M7 hot folder, perbaikan M-011) di-merge ke `win` (fast-forward)

## Ringkasan

| Langkah | Hasil |
|---|---|
| 1. `pnpm --filter booth e2e` | **Lulus**: 4 passed (19,5 s). `dotnet test` 66/66, lint/typecheck/test lulus |
| 2. M-011 di app hasil build | **Lulus**: kursor `none` juga di tombol; entri auto-start **`id.tetraphoto.booth`**; aktifkan → matikan, **registry akhirnya bersih**; crash 3× → pulih, tidak ada sesi mulai sendiri. `R-ERROR preloadScripts` masih muncul setelah tiap crash, tidak di boot pertama |
| 3. Hot folder: sesi penuh | **Lulus**: 3 foto 5184×3456, strip, PDF. File masuk → preview **±1,0–1,4 s** |
| 3. Hot folder: tulis pelan | **Lulus**: JPEG 14,6 MB ditulis 7 s per 64 KB → terbaca utuh, preview **194–279 ms** setelah file selesai |
| 3. Hot folder: tanpa file | **Lulus sesuai desain**, tapi tamu menunggu **±20 s** di layar capture sebelum "kamera lagi disiapkan" (temuan 2) |
| Temuan penting | **Print bisa hilang dan job macet `queued` selamanya** saat booth ditutup di tengah spooling (temuan 1, M-012) |

## 1. E2E

```
pnpm --filter booth e2e   →   4 passed (19.5s)   (crew, kiosk crash, kiosk keluar, hot folder)
```

## 2. M-011 di app hasil build

`electron-builder --win --x64 --dir` + `dotnet publish -r win-x64 --self-contained` → `$W\distapp\app\{booth,camera}`, dijalankan lewat Playwright tanpa `--kiosk`.

- **Kursor:** `getComputedStyle` → wrapper `none`, `BUTTON` `none`, tombol "SENTUH UNTUK MULAI" `none`. (`BODY` dan div terluar `auto`, di luar wrapper kiosk.)
- **Auto-start:** "Auto-start: mati" → **Aktifkan** → registry `id.tetraphoto.booth REG_SZ "C:\Users\USER\TetraBooth\distapp\app\booth\Tetra Booth.exe"` → **Matikan** → entri hilang. `reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Run` di akhir W-017: tidak ada entri Tetra/tetraphoto/electron.
- Kiosk, `close()` ditolak, 6 shortcut diblokir, Keluar aplikasi → exit 0 (sama dengan W-016).
- **Crash renderer 3×** (`forcefullyCrashRenderer`, diperiksa dari proses main): ketiganya pulih ke attract, `window.tetra` ada, dan 8 s kemudian masih di attract, **tidak ada sesi yang mulai sendiri**.
- **`R-ERROR preloadScripts`:** tidak muncul di boot pertama, tapi **masih muncul setelah setiap crash** (sekarang ±390 ms setelah crash, sesuai reload yang ditunda):
  ```
  ERROR [window] renderer mati (crashed), muat ulang
  R-ERROR Electron sandboxed_renderer.bundle.js script failed to run
  R-ERROR TypeError: Cannot destructure property 'preloadScripts' of 'binding.startupData' as it is null.
  ```
  Menunda reload tidak menghilangkannya. Booth tetap berfungsi normal, jadi ini hanya kebersihan log.

## 3. Hot folder manual

Booth dev `--camera hotfolder --hot-folder $W\hot --data $W\data --printer "Microsoft Print to PDF" --paper-2x6x2 A5 --print-to-file $W\prints`, dikendalikan Playwright. "EOS Utility" disimulasikan skrip Node yang menulis JPEG ke `$W\hot` 1,8 s setelah "Foto N dari 3" muncul (dalam toleransi 2 s). JPEG dibuat dari `nativeImage` (gradien atau derau acak), **bukan** foto dari kamera.

### Sesi penuh (tulis sekaligus, JPEG gradien 5184×3456, 303 KB)

| Foto | File masuk → preview |
|---|---|
| 1 | 1384 ms |
| 2 | 1036 ms |
| 3 | 1020 ms |

`raw/1..3.jpg` 5184×3456, strip dan PDF terbentuk, `[print] selesai 3rykrrhT5y · kertas 699`. Jeda ±1 s karena capture baru diminta di akhir countdown (file masuk ±1,2 s lebih awal, dalam toleransi 2 s). Dari capture diminta ke preview ±130 ms.

### Tulis pelan

- JPEG gradien 303 KB, 64 KB per 150 ms (lebih lambat dari polling 100 ms): tulis 0,8 s, preview 196–542 ms setelah file selesai. Tidak ada `capture_unreadable`.
- **JPEG derau acak 14,6 MB (realistis untuk 18 MP), 64 KB per 20 ms: tulis ±7,1 s**, preview **279 / 194 / 247 ms** setelah file selesai. Ketiga raw 5184×3456 14,6 MB (utuh), print `hhYzkVZpHQ.pdf` terbentuk. File tidak dibaca setengah jalan karena handle penulis masih terbuka dan Camera Service membuka dengan `FileShare.None`.

### Tanpa file

Foto 1 sengaja tidak dikirim:

```
+3,0 s  [phase] capture
+13 s   R-WARN [session] capture gagal: … Tidak ada foto baru di hot folder dalam 10 detik
+23 s   R-WARN [session] capture gagal (retry otomatis, 10 s lagi)
+23 s   [phase] camera_error  → layar "Sebentar ya, kamera lagi disiapkan"
+25,4 s countdown "Foto 1 dari 3" lagi (reconnect hot folder langsung berhasil)
```

File yang ditulis di countdown berikutnya masuk normal (preview ±1,0 s), dan sesi selesai dengan 3 foto.

## Temuan

### 1. Print hilang dan job macet saat booth ditutup di tengah spooling (penting, M-012)

Skenario: sesi 3 selesai, booth ditutup normal (`app.close()`) ±1 s setelah QR, saat Camera Service sedang spooling.

- Jurnal: `GBwjnhPNfn spooling` tanpa `spooled`. `$W\prints\GBwjnhPNfn.pdf` **0 byte**. Tamu tidak mendapat cetakan.
- Boot berikutnya (dan **setiap boot sesudahnya**):
  ```
  [print] GAGAL GBwjnhPNfn: print_uncertain Camera Service berhenti saat job ini diserahkan ke printer. Cek lembar yang keluar, lalu cetak ulang dari mode crew bila perlu.
  [print] kirim ulang GBwjnhPNfn            (1–3 ms kemudian)
  ```
  `print_jobs`: `queued`, attempts 2. Kirim ulang menimpa status `failed` dari `print_uncertain`, sehingga job **tidak pernah muncul di "Cetak gagal"** menu crew dan tertahan `queued` selamanya.

Saran:
1. Saat keluar (tutup normal/Keluar aplikasi), hentikan Camera Service secara halus: tunggu antrean print selesai (dengan batas waktu), baru kill.
2. `print_uncertain` harus final: booth tidak mengirim ulang job yang sudah `failed: print_uncertain`, atau kirim ulang tidak boleh menimpa status yang datang dari event sesudahnya (race).
3. Tampilkan `print_uncertain` di "Cetak gagal" supaya crew bisa memutuskan cetak ulang.

### 2. Hot folder tanpa file: tamu menunggu ±20 s (UX)

Timeout 10 s × 2 percobaan = ±20 s di layar capture tanpa umpan balik, baru muncul "kamera lagi disiapkan". Untuk hot folder, pertimbangkan pesan lebih awal (mis. setelah timeout pertama) atau timeout pertama lebih pendek.

### 3. `R-ERROR preloadScripts` setelah crash masih ada (kecil)

Lihat §2. Tidak berdampak fungsi.

## Bersih-bersih

`$W\data`, `$W\hot`, `$W\prints`, `$W\shots`, `$W\tmp\*`, `$W\distapp`, `apps\booth\release` dihapus. Registry `Run` bersih. Tidak ada proses booth/Camera Service tersisa.
