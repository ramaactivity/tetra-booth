# Checklist event (percontohan & event berikutnya)

Untuk Rama dan crew. Booth = laptop Windows + Canon 60D (digiCamControl) + DNP DS-RX1HS. Centang dari atas ke bawah.
LumaBooth disiapkan sebagai cadangan, tapi **jangan dipakai kecuali booth benar-benar macet** (kriteria Fase 1b: satu event penuh tanpa pindah).

## A. H-3 sampai H-1 (di rumah)

### Admin (booth.tetraphoto.com/admin)
- [ ] **Event**: buat event → isi nama, tanggal, lokasi, nama klien.
- [ ] **Template**: menu Template → buat/pilih template (format 4R / 2R / Polaroid + orientasi). Simpan. Tombol **Tes cetak** di editor untuk cek cepat di printer rumah.
- [ ] **Pengaturan event**: pilih template, warna latar, sesi (countdown, jumlah cetak), masa simpan, **Device → pilih booth (B02)** → Simpan.
- [ ] Kalau pakai **data tamu (lead capture)**: tulis teks persetujuan asli (nama usaha + tujuan). Jangan pakai teks contoh.
- [ ] **Link klien** (`/g/…`) dan **live slideshow** (`/live/…`): tombol "Buat Link" → kirim link galeri ke klien. Klien sendiri yang menyalakan galeri publik dari link itu.

### Laptop booth
- [ ] Aplikasi versi terbaru: mode crew → **Update Aplikasi**, atau pasang dari **https://booth.tetraphoto.com/download/booth** (SmartScreen: *More info → Run anyway*).
- [ ] Mode crew → **Kamera & Printer**: kamera **DSLR (digiCamControl)** (folder `C:\TetraBooth\hot`, pemicu `http://localhost:5513/?CMD=Capture`), printer **DS-RX1** → Simpan & Mulai Ulang (sekali per laptop, tersimpan).
- [ ] Offset kalibrasi DNP: file `booth-flags.txt` (bagian E), sekali per laptop.
- [ ] Booth sudah dipasangkan (mode crew → kartu Koneksi menunjukkan nama booth, bukan "Belum dipasangkan").
- [ ] Mode crew → **Ganti Event → Sync dari Cloud** → pilih event. Layar awal menampilkan nama event.
- [ ] **Windows Update dijeda** (Settings → Windows Update → Pause updates 1 minggu). Update driver grafis di tengah event pernah membuat booth macet.
- [ ] Power: tutup laptop = tidak melakukan apa-apa, sleep = Never saat dicolok charger.

### Printer DNP
- [ ] **2inch cut** sesuai format event (mode crew → **Setel Printer**, atau Settings → Printers → DS-RX1 → Printing preferences → Advanced):
  - **Enable**: 2R strip dan tiket.
  - **Disable**: 4R dan polaroid (polaroid disobek crew di garis perforasi).
  - Nilainya harus benar-benar diganti, lalu OK → Apply → OK. Pakai antrean **DS-RX1** saja, jangan buka dialog antrean lain.
- [ ] Mode crew → **Tes Cetak** 1 lembar: potongan di tengah (2R), tidak ada garis putih, desain tidak terpotong.
- [ ] Roll baru dipasang? Mode crew → **Ganti Roll Kertas** → isi jumlah lembar roll.
- [ ] Bawa roll + ribbon cadangan. Polaroid: kertas berperforasi.

### Kamera 60D
- [ ] ISO/shutter/aperture/white balance: mode crew → Kamera & Printer (saat digiCamControl menyala), atau langsung di kamera (dial **M**).
- [ ] Baterai penuh + cadangan (atau dummy battery). Auto power off = **Off**.
- [ ] digiCamControl: folder sesi `C:\TetraBooth\hot`, hanya JPG, web server port 5513 aktif.
- [ ] Mode crew → **Tes Jepret**: foto muncul.

### Internet & halaman tamu
- [ ] Modem/HP hotspot untuk venue, kuota cukup.
- [ ] Dari HP **pakai data seluler (bukan Wi-Fi)**: buka satu link halaman tamu hasil sesi uji. Foto harus tampil.

## B. Hari-H: setup (datang ±90 menit sebelum mulai)

- [ ] Rakit, colok charger laptop & printer, kabel USB kamera & printer langsung ke laptop.
- [ ] Urutan nyala: **kamera → digiCamControl (tunggu "Camera is connected") → Tetra Booth** (shortcut Desktop).
- [ ] Sambungkan internet venue.
- [ ] Mode crew (ketuk pojok kanan atas layar awal **5× dalam 3 detik**, masukkan PIN): semua kartu hijau
  - Kamera: Terhubung · Printer: Siap · Koneksi: Online, **0 file** · Kertas sesuai roll.
- [ ] Event aktif benar (pojok kanan atas menu crew).
- [ ] Satu sesi penuh sebagai tamu: foto → pilih cetak → hasil cetak → **scan QR dengan HP data seluler**.
- [ ] Live slideshow dibuka di TV/laptop kedua (link `/live/…`).
- [ ] Laptop LumaBooth cadangan siap tapi tidak dipakai.

## C. Selama event

- Pantau **sisa kertas** (peringatan muncul otomatis saat menipis). Ganti roll → mode crew → Ganti Roll Kertas.
- **Cetak gagal** → mode crew → kartu Cetak gagal → **Cetak ulang**.
- Layar "kamera sedang disiapkan ulang": cek digiCamControl masih terbuka dan kamera menyala. Kalau perlu, cabut-colok kabel USB kamera. Booth pulih sendiri (±30 detik).
- Internet putus: **biarkan**, booth tetap jalan, foto dikirim otomatis saat online lagi.
- Jangan menutup aplikasi selain lewat mode crew. Jangan update apa pun.
- Catat di HP: jam mulai/selesai, masalah + jamnya, apakah sempat pindah ke LumaBooth.

## D. Setelah event

- [ ] Biarkan internet menyala sampai kartu **Koneksi = 0 file** (semua foto terkirim).
- [ ] Mode crew → **Tutup Aplikasi**. Matikan kamera, printer.
- [ ] Cek galeri klien (`/g/…`) berisi semua sesi. Kirim ulang link ke klien kalau perlu.
- [ ] Laporkan ke Claude Mac: jumlah sesi & lembar tercetak, catatan masalah, foto hasil cetak yang janggal. Ini untuk menutup kriteria Fase 1b & 2 (≥95% sesi terunggah dalam 5 menit saat online).

## E. Sekali per laptop: `booth-flags.txt` (hanya untuk setelan yang tidak ada di mode crew)

Kamera & printer diatur dari mode crew → **Kamera & Printer** (DECISIONS #85). Setelan lain (offset kalibrasi DNP, nama kertas) ditulis di file (DECISIONS #83):

1. Tekan **Win + R**, ketik `%APPDATA%\TetraBooth`, Enter (folder data booth, ada setelah booth pernah dibuka sekali).
2. Buat file teks bernama **`booth-flags.txt`** (pastikan bukan `booth-flags.txt.txt`), isi:
   ```
   --paper-2x6x2 "(6x4)" --print-offset "7.335,6.70"
   ```
3. Tutup booth lewat mode crew, buka lagi. Log booth (`%APPDATA%\TetraBooth\logs`) mencatat `[config] flag dari …`.

Baris yang diawali `#` diabaikan. Nilai yang berisi spasi ditulis dalam tanda kutip. `--print-offset` = hasil kalibrasi DNP di laptop ini; laptop lain perlu kalibrasi sendiri (docs/WINDOWS.md).
