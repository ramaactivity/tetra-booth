# Laporan Windows: ulang uji kill 20× dengan print (W-015, verifikasi M-008 & M-009)

Tanggal: 2026-09-24 · Basis: `main` @ `929258c` di-merge ke `win` · Booth men-spawn Camera Service (Debug), `--camera=simulated --demo`

Flag printer memakai **bentuk spasi** sesuai tugas: `--printer "Microsoft Print to PDF" --paper-2x6x2 A5 --print-to-file "$W\prints"`.

## Ringkasan

| Kriteria | Hasil |
|---|---|
| Flag bentuk spasi terbaca (M-008 no. 1) | **Lulus**: `[supervisor] … --printer Microsoft Print to PDF --paper-2x6x2 A5 --print-to-file …` |
| Boot tanpa `camera service: tidak terhubung` (M-008 no. 2) | **Lulus**: `[supervisor] Camera Service siap dalam 636 ms`, `R-INFO [boot] camera service: OK · printer ready`, 0 baris "tidak terhubung" |
| Setiap sesi `completed` punya ≥ 1 PDF | **Lulus**: 9 sesi completed, 9 PDF, 0 sesi tanpa PDF |
| Tidak ada `print_jobs` `queued` > 1 menit setelah uji | **Lulus**: 9/9 `done` saat dicek (booth jalan 70 s setelah kill terakhir) |
| Log `tertunda`/`kirim ulang` saat relevan | `[print] kirim ulang` ×3 (`zADJcYVttY`, `QqfjefqSrK`, `Q2EBEZN9Mh`). `tertunda` ×0: kebetulan tidak ada submit yang jatuh saat service mati |
| Cetak ganda | **0** menurut log (`[print] selesai` per id = 1). Lihat keterbatasan |

## Jalannya uji

1. Booth start, lalu `[print] selesai h2bDVmARKn · kertas 699` (print pertama sebelum kill).
2. `Stop-Process -Force` pada `TetraCamera.exe` 20×, jeda 5 s. **20/20 pulih**, PID baru dalam 0,6–1,0 s. Kill terakhir 15:55:03.
3. Booth dibiarkan 70 s, lalu ditutup normal (`CloseMainWindow`). Sisa `electron`/`TetraCamera` 0.

## Data

| | Nilai |
|---|---|
| `sessions` | completed 9, in_progress 1 (sesi yang sedang berjalan saat booth ditutup; akan jadi `abandoned` saat boot berikutnya) |
| `print_jobs` | done 9. attempts 1: 6 job, attempts 2: 3 job (dikirim ulang) |
| PDF di `$W\prints` | 9, satu per sesi completed (`<sessionId>.pdf`) |
| Log `[print]` | selesai 9, kirim ulang 3, tertunda 0, GAGAL 0 |

## Keterbatasan: deteksi cetak ganda

Job yang dikirim ulang memakai `jobId` sama, jadi `--print-to-file` menulis ke nama file yang sama dan file lama tertimpa (adapter menghapus file lama dulu). Kalau Camera Service lama sempat mencetak job sebelum dibunuh tapi `print.done` belum sampai ke booth, lalu booth mengirim ulang, printer fisik mencetak **dua kali**, sedangkan PDF dan log booth tetap menunjukkan satu. Di uji ini ketiga job yang dikirim ulang masing-masing hanya punya satu `[print] selesai`, tapi cetak ganda fisik tidak bisa dibuktikan atau dibantah dari PDF. Untuk uji DNP nyata (Fase 1b), hitung lembar yang keluar. Atau Camera Service bisa menulis log per job yang diserahkan ke spooler, supaya bisa dibandingkan.

## File diubah

- `docs/reports/windows/2026-09-24-m9-print-crash.md` (baru), `docs/HANDOFF.md`
