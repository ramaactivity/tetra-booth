# 02 — FSD: Spesifikasi Fungsional

Semua teks UI dalam Bahasa Indonesia. Nilai default bisa diubah per event di admin.

---

## 1. Booth App

### 1.1 Boot & kiosk
- Auto-start saat Windows login, fullscreen kiosk, kursor disembunyikan.
- Mencegah sleep layar & sistem selama app berjalan.
- Electron menjalankan Tetra Camera Service sebagai child process dan me-restart otomatis jika mati (watchdog).
- Jika belum dipasangkan (pairing), tampil layar pairing.

### 1.2 Pairing device
1. Admin klik **Tambah Booth** → muncul kode 6 digit (berlaku 10 menit).
2. Crew ketik kode di booth → booth menerima device token permanen.
3. Token disimpan terenkripsi di laptop. Bisa dicabut dari admin.

### 1.3 Mode crew
- Dibuka dengan tap 5x di pojok kanan atas dalam 3 detik, lalu PIN crew (4–6 digit, diatur di admin).
- Menu:
  - Pilih event (dari event yang ditugaskan ke device ini, tersimpan offline).
  - Sync event (download ulang config + aset).
  - Cek kamera: live view + test shot.
  - Test print.
  - Counter kertas: sisa lembar, reset saat ganti roll.
  - Status antrean upload (jumlah pending, error terakhir, tombol "coba sekarang").
  - Update aplikasi (hanya dari menu ini, tidak pernah otomatis saat event).
  - Keluar dari kiosk.

### 1.4 Flow mode event
```
ATTRACT → COUNTDOWN → CAPTURE (x N) → REVIEW → COMPOSE → PRINT_SELECT → PRINTING → QR → ATTRACT
```

### 1.5 Flow mode photobox
```
ATTRACT → PILIH_LAYOUT → PILIH_JUMLAH_CETAK → BAYAR_QRIS → COUNTDOWN → CAPTURE (x N)
→ REVIEW → COMPOSE → PRINTING → QR → ATTRACT
```
- Jumlah cetak dipilih **sebelum** bayar supaya total harga final di satu tagihan.
- Timer sesi mulai setelah pembayaran lunas. Saat habis: foto yang sudah ada dipakai, slot kosong diisi otomatis dengan capture terakhir, lanjut ke compose.

### 1.6 Attract screen
- Gambar atau video loop per event (dari admin), sesuai orientasi event.
- Tulisan "Sentuh untuk mulai" (bisa diganti).

### 1.7 Capture
- Countdown default 3 detik, angka besar di atas live view.
- Live view di-mirror (seperti cermin). Hasil foto **tidak** di-mirror.
- Jumlah foto = jumlah slot di layout.
- Jeda antar foto default 2 detik, menampilkan hasil foto sebelumnya sebentar.
- Kamera gagal capture → coba ulang 1x otomatis; gagal lagi → layar "Sebentar ya, kamera lagi disiapkan" + auto-reconnect; sesi dilanjutkan dari foto yang gagal.

### 1.8 Review & retake
- Grid semua foto. Tap satu foto → retake foto itu saja (countdown → capture → kembali ke grid).
- Batas retake per foto default 1. Setelah habis, tombol retake foto itu hilang.
- Tombol **Lanjut**. Tanpa interaksi 20 detik → otomatis lanjut.

### 1.9 Compose
- Render strip memakai template engine bersama (lihat TSD §6).
- Output per sesi:
  - `strip` — resolusi cetak (4R: 1200×1800 px @300dpi).
  - `strip_web` — strip versi web.
  - `original` x N — versi web, sisi panjang 2400 px.
  - `thumb` — thumbnail strip & original, sisi panjang 480 px.
  - Full-res mentah tetap di disk lokal, tidak di-upload.

### 1.10 Cetak
- Pilihan jumlah 1 s/d `max_prints` (default event: 2).
- Photobox: harga layout termasuk 1 lembar; lembar tambahan × `extra_print_price`.
- Print masuk antrean. Printer error (kertas/ribbon habis, offline) → sesi tetap selesai & QR tetap muncul; print ditahan dan crew mendapat notifikasi di layar kecil pojok. Crew bisa cetak ulang dari mode crew.
- Counter kertas berkurang per lembar. Sisa ≤ 30 lembar → peringatan di mode crew & admin.

### 1.11 Layar QR
- QR ke `/s/{sessionId}`, langsung muncul walau offline.
- Tampil hingga tombol **Selesai** ditekan atau 45 detik.

### 1.12 Pembayaran QRIS (photobox)
- Tampil QR + total + hitung mundur (5 menit).
- Booth mengecek status tiap 2 detik. Lunas → animasi sukses → countdown mulai.
- Kedaluwarsa → "Waktu pembayaran habis" + tombol buat ulang.
- Tidak ada internet → "Pembayaran belum bisa diproses, hubungi crew". Tidak ada jalur bypass.

### 1.13 Offline
- Semua langkah kecuali pembayaran QRIS jalan tanpa internet.
- Indikator kecil di mode crew: online/offline + jumlah antrean upload.

---

## 2. Halaman Tamu — `/s/{sessionId}`

| State | Kondisi | Tampilan |
|---|---|---|
| `pending` | Sesi belum/sebagian ter-upload | "Foto kamu lagi dikirim…" + animasi, auto-refresh tiap 5 detik. Aset yang sudah ada langsung tampil. |
| `ready` | Upload lengkap | Konten penuh |
| `expired` | Lewat `guest_expires_at` | Pesan sopan + kontak Tetra |
| `removed` | Disembunyikan/dihapus admin | "Foto ini sudah tidak tersedia" |
| `unknown` | ID belum dikenal server (booth masih offline) | "Foto kamu belum sampai. Biasanya beberapa menit setelah booth tersambung internet." + auto-refresh tiap 15 detik. Server tidak bisa membedakan ID yang belum di-sync dengan ID salah; karena ID tidak bisa ditebak, ini aman. |

**Isi (ready):**
- Header branding event (logo/nama acara, warna). Footer kecil "by Tetra Photobooth".
- Strip besar → tombol **Simpan** (Web Share API dengan file → "Save Image" masuk galeri HP). Fallback browser tanpa dukungan: download biasa.
- Original (grid) → tiap foto bisa disimpan; tombol **Simpan semua**.
- Animasi (Fase 5).
- Link "Lihat galeri acara" jika galeri event publik aktif.
- Info masa berlaku: "Tersedia sampai {tanggal}".

**Lead capture (jika aktif):**
- Field diatur per event (nama, email, WhatsApp, custom).
- Mode `gate` (wajib isi sebelum lihat foto) atau `optional` (form di bawah).
- Checkbox persetujuan wajib (UU PDP), teks persetujuan diatur per event.

**Tracking:** buka halaman, simpan foto, simpan semua → `analytics_events`.

---

## 3. Galeri Klien — `/g/{clientToken}`

- **Hero:** cover event, nama acara, tanggal, lokasi, statistik singkat (sesi, foto).
- **Timeline:** sesi dikelompokkan per 30 menit ("19.00–19.30"), sticky header saat scroll.
- **Filter:** Strip / Original / Animasi / Favorit.
- **Lightbox:** geser kiri-kanan, simpan, favorit.
- **Favorit:** disimpan di server per event (tanpa login).
- **Pilih beberapa** → download ZIP. **Download semua** → ZIP semua.
- **Slideshow:** fullscreen, auto-play, bisa dipakai di TV.
- **Toggle galeri publik:** jika on, tamu bisa membuka galeri event dari halaman tamu (read-only, tanpa favorit & tanpa toggle).
- **Hitung mundur:** "Galeri tersedia {n} hari lagi".
- **Temukan Foto Saya (Fase 5):** upload selfie + persetujuan → tampil sesi yang mengandung wajah itu.
- Foto yang disembunyikan admin tidak tampil.
- Token dicabut → halaman "Link ini sudah tidak aktif".

---

## 4. Live Slideshow — `/live/{liveToken}`

- Untuk TV/proyektor di venue. Fullscreen, tanpa kontrol.
- Strip baru muncul otomatis begitu upload selesai (realtime).
- Rotasi: foto terbaru diprioritaskan, lalu acak dari yang lama.
- QR pojok layar ke galeri publik (jika aktif) atau logo Tetra.
- Token terpisah dari token klien.

---

## 5. Admin — `/admin`

### 5.1 Login & role
- Login email + password (Supabase Auth).

| Kemampuan | Owner | Admin | Crew |
|---|---|---|---|
| Lihat event & dashboard | ✅ | ✅ | Hanya event yang ditugaskan |
| Buat/edit event & template | ✅ | ✅ | ❌ |
| Sembunyikan foto | ✅ | ✅ | ❌ |
| Hapus foto / event | ✅ | ✅ | ❌ |
| Device (pair/cabut) | ✅ | ✅ | ❌ |
| Status device | ✅ | ✅ | ✅ |
| Transaksi & omzet | ✅ | ✅ | ❌ |
| Export lead | ✅ | ✅ | ❌ |
| Tim & role | ✅ | ❌ | ❌ |

### 5.2 Daftar event
- Tab: Mendatang / Berlangsung / Selesai. Kartu dengan cover, nama, tanggal, mode.
- Cari nama event. Tombol **Buat event**.

### 5.3 Dashboard event
- **Statistik:** sesi, foto, lembar tercetak, upload lengkap/pending.
- **Share analytics:** QR open rate, total simpan foto, ZIP diunduh, lead terkumpul.
- **Grafik:** sesi per 30 menit.
- **Status booth** yang ditugaskan: online/terakhir terlihat, kamera, antrean upload, sisa kertas.
- **Aksi:** salin/buat ulang/cabut link klien, salin link slideshow, export lead CSV, download semua, hapus event.
- **Grid galeri:** select all, pilih beberapa → download / sembunyikan / tampilkan / hapus.

### 5.4 Pengaturan event
| Grup | Field |
|---|---|
| Dasar | Nama, tanggal, lokasi, mode, orientasi layar, device yang ditugaskan |
| Pengalaman | Countdown, jeda antar foto, batas retake, maks cetak, timer sesi (photobox), durasi layar QR |
| Layout | Pilih layout; photobox: beberapa layout + harga + harga lembar tambahan |
| Attract screen | Upload gambar/video (sesuai orientasi), teks ajakan |
| Branding halaman tamu | Logo, warna utama, cover galeri klien |
| Galeri | Galeri publik (default off), retensi tamu (30), retensi klien (90) |
| Lead capture | On/off, field, mode gate/optional, teks persetujuan |
| Pembayaran | (photobox) aktif/nonaktif |

### 5.5 Editor template
- Preset kertas: `4R` (4×6, 1200×1800) dan `2x6x2` (dua strip 2×6 dalam satu 4R, dipotong printer).
- Upload overlay PNG transparan (ukuran harus sesuai preset; untuk `2x6x2` cukup upload satu strip 600×1800, engine menggandakan).
- Slot foto: tambah, geser, ubah ukuran (kunci rasio 3:2 atau 2:3 opsional), rotasi, urutan (foto di bawah/atas overlay).
- Teks dinamis: `{event_name}`, `{date}`, `{custom}` dengan font upload (TTF/OTF/WOFF2).
- Background warna/gambar di bawah semuanya.
- Preview memakai foto contoh. Preview = hasil cetak (engine yang sama dengan booth).
- Layout punya versi. Event memakai versi yang dipilih; edit layout tidak mengubah event yang sudah selesai.

### 5.6 Device
- Daftar: nama, ID pendek, versi app, orientasi & resolusi layar, status online (terakhir terlihat < 2 menit), event aktif, antrean upload, sisa kertas.
- Tambah (kode pairing), ganti nama, cabut akses.

### 5.7 Transaksi photobox
- Daftar transaksi: waktu, event/lokasi, device, layout, jumlah cetak, nominal, status.
- Filter tanggal & event. Ringkasan omzet per hari & per event. Export CSV.

### 5.8 Tim
- Undang via email, atur role, nonaktifkan.

### 5.9 Audit log
- Dicatat: hapus/sembunyikan foto, hapus event, cabut device, buat ulang/cabut link klien, export lead. Siapa & kapan.
