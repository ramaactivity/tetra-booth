# Webcam bawaan + opsi cermin (2026-09-26)

Booth dev `win` (setara main `07ce250`), laptop booth Rama, HP HD Camera (04f2:b76b).

## Foto webcam hitam di W-033
- Probe Electron (constraint sama dengan `webcam.ts`: ideal 2560×1920 @30): `getUserMedia` 668 ms, stream 1280×720 @30.
  Kecerahan rata-rata frame 0 ms = 156, 100 ms = 151, 1 s = 141, 5 s = 138 (skala 0–255). Frame pertama sudah terang.
- Demo booth `--camera=webcam --demo` 75 s: 3 sesi selesai, `raw/*.jpg` 1280×720, strip normal (tidak hitam), compose 84–103 ms.
- Kesimpulan: kode webcam benar; foto hitam di W-033 karena penutup privasi kamera tertutup. Tidak perlu perbaikan kode.

## Opsi cermin (permintaan Rama)
Kamera & Printer → baris **Cermin (balik kiri-kanan)**: `Live view · ON/OFF` (bawaan ON) dan `Hasil foto · ON/OFF`
(bawaan OFF, sesuai DECISIONS #35). Disimpan di `device.json` (`mirrorLiveView`, `mirrorPhoto`), berlaku untuk
semua sumber kamera.
- Hasil foto dibalik di `camera/mirror.ts` (`withMirroredPhotos`): file raw langsung dibalik setelah capture, jadi
  preview, review, cetakan, original, dan cek ketajaman memakai foto yang sama. Saat ON muncul catatan bahwa tulisan
  di baju & latar ikut terbalik.
- Uji: kamera simulasi + `mirrorPhoto: true` → teks "Foto 1" di `raw/1.jpg` terbalik (cermin). e2e crew memeriksa
  bawaan ON/OFF, tombol simpan aktif setelah diubah.
- Belum diuji: waktu balik foto DSLR ukuran penuh (decode + encode JPEG di renderer), dan live view OFF dilihat langsung.

## Update 0.5.10 → 0.5.11 (mode crew)
Unduh 152 MB ±22 s, installer ±14 s, booth terbuka sendiri, log `[update] berhasil: 0.5.10 → 0.5.11`.

## Kontrol fokus DSLR (#88, keputusan Mac)
- **Tes Jepret** (live view): baris `Fokus dekat ◀◀◀ ◀◀ ◀ AF ▶ ▶▶ ▶▶▶ jauh`, hanya kalau kamera punya live view
  (digiCamControl). Perintah `LiveView_Focus` / `LiveView_Focus_M|MM|MMM|P|PP|PPP` (dicek di source digiCamControl:
  keduanya jalan di thread, HTTP menjawab sebelum lensa selesai bergerak). Kontrol ini ada di layar Tes Jepret,
  bukan di sheet Kamera & Printer, karena butuh live view.
- **Meter ketajaman live view** (semua kamera): skor yang sama dengan pengingat buram, ±3×/s, plus puncak. Puncak
  di-reset setiap fokus digeser.
- **AF sebelum tiap jepret** (Kamera & Printer, DSLR): AF dikirim saat live view mulai di awal tiap countdown, jadi
  sudah selesai sebelum shutter.
- Perbaikan kecil: tanpa kamera, digiCamControl menjawab ISO/Shutter dengan pesan exception .NET yang tampil sebagai
  nilai; sekarang dianggap kosong. Tombol Batal di sheet tidak lagi terjepit kalau isi sheet panjang.
- Uji: booth dev `--digicam` (digiCamControl jalan, **kamera dicabut**): tombol tampil, log `[camera] fokus af` /
  `fokus near1`. **Efek optik di 60D belum diuji.**
