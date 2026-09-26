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
