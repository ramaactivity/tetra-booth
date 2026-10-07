# Rencana Photo Stage

Status: **disetujui owner** (7 Okt 2026), jawaban owner di §6. Desain UI dibuat owner di Claude Design (meta prompt `handoff/claude-design-photo-stage/`); kode inti dikerjakan dulu dengan UI sederhana, lalu tampilan diganti persis desain. Latar bisnis: produk B2C berikutnya setelah booth event stabil (dokumen analisis bisnis, `riset-bisnis-2026-10/`). Paket Photo Stage sudah ada di pricelist tapi belum pernah terjual, karena software-nya belum ada.

## 1. Alur di lapangan

```
Rombongan naik pelaminan
 → operator laptop: Enter = rombongan baru (atau otomatis kalau ada jeda), pilih/ketik nama grup (boleh kosong)
 → fotografer jepret 1–5x dengan kamera yang di-tether ke laptop stage (tombol rana di kamera, bukan di layar)
 → foto masuk otomatis, warna disesuaikan preset event, lalu disimpan dan diunggah
 → TV di jalur turun: QR sesi itu + foto-fotonya + nama grup (±30 detik), lalu kembali ke galeri berjalan
 → tamu scan QR → halaman foto di HP (simpan 1 tap). Telat scan → galeri event, cari per jam / nama grup
```

Crew: Basic 2 (fotografer + operator), Standard 3 (+ helper QR di jalur turun), Premium 4–5 (+ pengatur pose).

## 2. Keputusan teknis utama

| Topik | Keputusan | Alasan |
|---|---|---|
| Mode | **Peran laptop** `role: "booth" \| "stage"` di `DeviceSettings` (crew menu / booth-flags), **bukan** mode event ketiga | Satu event = satu album. Laptop booth dan laptop stage memakai event yang sama. Mode event & photobox tidak tersentuh |
| Jepretan | Rana kamera fotografer. EDSDK sudah menerima transfer yang tidak diminta (`EdsdkDriver.OnObject` → `_pending`), yang sekarang dibuang. Tambah event kamera baru `capture.shot {path,width,height}` (camera-protocol + EventHub). Hot folder diberi kemampuan yang sama (file yang datang tanpa permintaan) untuk kamera lain / transmitter WiFi | Fotografer bekerja seperti biasa, tanpa layar countdown |
| Sesi | Runner/reducer sendiri yang kecil (`StageRunner`), tidak memakai `sessionReducer` booth. Sesi = rombongan. Sesi baru dibuat oleh Enter atau jeda > N detik (bawaan 45, 15–180, atau mati) | State machine booth (countdown/review/print) tidak cocok, dan risiko regresi ke booth nol |
| Output | Original 2400 px + thumb, tanpa strip. Upload memakai antrean dan endpoint yang sama, dengan field baru `source: "stage"` dan `groupName` (aditif, seperti `isTest` #153) | Pipa upload yang sudah teruji di event nyata |
| Warna | S1: preset = filter yang ada (`PHOTO_FILTERS`) + slider kecerahan/kontras/saturasi/kehangatan (string CSS filter, satu definisi untuk preview dan hasil), diterapkan ke original sebelum disimpan. Diatur dari foto tes, berlaku untuk semua foto berikutnya. Tahap lanjut: LUT `.cube` (proses piksel di canvas) | Cepat, tanpa dependensi. LUT butuh pemrosesan piksel, jadi tahap 2 |
| TV | Jendela Electron kedua di layar eksternal (HDMI dari laptop stage), route renderer `stage-tv`. QR dibuat offline (URL `/s/{id}` sudah diketahui). Idle memakai ulang galeri lokal (`screens/Gallery.tsx`) | Tetap jalan tanpa internet (aturan offline-first). Tamu tetap butuh sinyal untuk membuka QR |
| Cloud | Migrasi aditif: `sessions.source` (default `booth`), `sessions.group_name`. Galeri klien: tab **Photobooth / Photo Stage**, nama grup di tiap sesi, cari nama grup. Live slideshow & halaman tamu menerima sesi tanpa `strip_web` (pakai original) | Sekarang galeri dan live hanya menampilkan sesi ber-strip |
| Daftar grup | Tahap 1: admin menempel daftar (satu baris satu grup) / CSV di Pengaturan event, lalu tersinkron ke laptop stage lewat bundle. Tahap lanjut: klien/WO mengisi di portal Ops → field kontrak baru | Tidak menunggu Ops; kontraknya menyusul |

## 3. Tahapan (semua di balik `role: "stage"`; laptop booth tidak berubah)

| Tahap | Isi | Selesai jika |
|---|---|---|
| **S1. Jepret, kelompok & warna** ✅ (7 Okt, #178; UI sementara) | Event kamera `capture.shot` (Canon + folder pantau untuk merek lain), `StageRunner`, layar operator (sesi aktif, foto masuk, Enter = rombongan baru, ketik/pilih nama grup, ubah nama sesi sebelumnya, Jeda/Lanjut, jeda otomatis bisa diatur/dimatikan), preset warna (filter + slider dari foto tes), simpan lokal + upload dengan `source`/`groupName`, migrasi cloud | 200 jepretan simulasi (kamera palsu + hot folder) terkelompok benar dan terunggah, booth biasa lulus semua tes lama |
| **S2. TV + QR** ✅ (7 Okt, #179; UI sementara) | Jendela TV di layar kedua, QR sesi terbaru + foto + nama grup, idle galeri, pengaturan durasi tampil | Uji dua layar di laptop Windows: QR terbaca HP, TV kembali ke galeri |
| **S3. Web** ✅ (7 Okt, #180) | Halaman tamu untuk sesi stage, galeri klien bertab Photobooth/Photo Stage + cari nama grup + per jam, live slideshow campur, ZIP per sumber | E2E web lulus, dicek di HP |
| **S4. Daftar grup** ✅ (7 Okt, #181; dari portal Ops menyusul) | Daftar grup dari admin (tempel/CSV) tersinkron ke laptop stage | Daftar grup muncul di laptop stage |
| **S5. Lanjutan** | Cetak instan 4R dari stage (✅ #183, uji printer nyata di Windows), helper HP mengganti nama grup, LUT `.cube`, daftar grup dari portal Ops (sisi Booth siap, #182), Temukan Foto Saya (Fase 5, #76) | Dipilih owner sesuai prioritas |

Urutan rilis: S1–S3 cukup untuk **menjual paket Photo Stage pertama**. S4–S5 menyusul.

## 4. Risiko

- **Jangan mengganggu booth event menjelang Januari** (berhenti langganan LumaBooth). Semua kode stage terpisah (`role`), dengan tes regresi booth di setiap rilis. Rilis stage diuji di laptop terpisah dulu.
- **Kamera fotografer:** EDSDK hanya Canon. Fotografer dengan Sony/Nikon memakai hot folder (aplikasi tether pabrikan / transmitter WiFi), dan perlu diuji.
- **Kabel tether panjang** di pelaminan: pakai kabel USB aktif atau WiFi transfer. Ini keputusan peralatan.
- **Sinyal venue:** QR butuh internet di HP tamu. Upload antre otomatis (sudah ada).

## 5. Alur & skema UX (disempurnakan)

**Persiapan (sekali per acara, ±3 menit) di laptop stage**
1. Mode crew → **Peran laptop: Stage** → pilih event (event yang sama dengan booth).
2. **Kamera:** Canon tersambung otomatis (EDSDK). Merek lain (Sony, Lumix, Fujifilm, Nikon) memakai aplikasi tether pabrikan (Imaging Edge, Lumix Tether, Fujifilm X Acquire, Nikon NX Tether, atau Capture One) yang menyimpan ke **folder pantau** Tetra. Layar persiapan menampilkan "Jepret 1 foto tes" sampai foto masuk ✓.
3. **TV:** pilih layar tujuan (HDMI, HDMI nirkabel, atau Miracast muncul sebagai layar kedua). Tombol "Tampilkan uji di TV".
4. **Warna:** foto tes tampil besar; atur filter + slider (kecerahan, kontras, saturasi, kehangatan) dengan pratinjau sebelum/sesudah, lalu "Pakai untuk semua foto". Bisa disimpan sebagai preset bernama untuk acara lain.
5. **Pemisah rombongan:** otomatis setelah jeda N detik (bawaan 45, bisa diatur 15–180) atau **mati**, dengan rombongan baru hanya lewat tombol.
6. **Mulai.**

**Layar operator (selama acara)**
```
┌ status: Kamera ✓ · TV ✓ · Upload 3 antre · Internet ✓ ─────────────── [Jeda] ┐
│ ROMBONGAN #47  · nama grup [ Keluarga Besar Bpk. Hadi ▾ ] (ketik / pilih)      │
│ [foto1][foto2][foto3] ← masuk otomatis, langsung berwarna preset               │
│                                                                                 │
│ Berikutnya dari daftar:  ▸ Teman Kantor PT ABC   Sahabat SMA   …  (klik = pakai)│
├─────────────────────────────────────────────────────────────────────────────────┤
│ Riwayat: #46 Keluarga Inti ✓ 4 foto · #45 Tamu 19.42 ✓ 3 foto · …               │
│   (klik = ganti nama / gabung ke sebelumnya / pisah / sembunyikan foto)         │
└ [Rombongan baru ⏎]   [Jeda / Lanjut ␣]   Otomatis: 45 dtk [ubah]                ┘
```
- **⏎ Enter** = rombongan baru, **Spasi** = jeda/lanjut (foto yang masuk saat jeda ditampung "belum dikelompokkan" untuk diputuskan operator), **Tab** = isi nama grup berikutnya dari daftar.
- Nama grup boleh kosong, dan bisa diisi belakangan dari riwayat. Tanpa nama, label otomatis "Tamu · 19.42".
- Masalah tampil jelas di bar status (kamera lepas, TV tidak tersambung, upload antre) tanpa menghentikan kerja.

**TV (layar kedua, terkunci layar penuh)**
- **Aktif** (sesi baru, ±30 detik, bisa diatur): nama grup besar, 1–5 foto, **QR besar** "Scan untuk ambil fotomu", dan dua rombongan sebelumnya kecil di samping untuk tamu yang turunnya lambat.
- **Idle:** galeri berjalan foto-foto acara, dengan QR kecil permanen "Belum dapat fotomu? Cari di sini" (galeri event).
- Rombongan baru langsung menggantikan tampilan aktif.

**Tamu (HP)**
- Scan QR → halaman foto rombongan: nama grup, semua foto (geser), "Simpan semua", dan link "Lihat semua foto acara" (cari per jam / nama grup).

**Klien & galeri**
- Tab **Photobooth · Photo Stage**. Di tab Photo Stage, foto tersusun per rombongan dengan nama grup, dan ada kolom cari nama grup.

## 6. Jawaban owner (7 Okt 2026)
1. Kamera fotografer bermacam-macam (Sony, Canon, Lumix, Fujifilm, Nikon), umumnya kabel, sebagian WiFi. → Canon lewat EDSDK; yang lain lewat **folder pantau** dari aplikasi tether pabrikan. Ini membuat folder pantau jadi jalur utama non-Canon, dan transfer WiFi bawaan kamera juga bisa diarahkan ke folder itu. Sony langsung (PTP, #169) menyusul setelah diuji di bodi asli.
2. TV lewat HDMI, atau nirkabel supaya kabel tidak terinjak tamu → lihat §7.
3. Jeda otomatis lebih panjang, bisa diatur, bisa dimatikan; crew bisa jeda/lanjut dengan klik. → bawaan 45 detik, rentang 15–180, mati, plus tombol Jeda/Lanjut.
4. Digital dulu; cetak instan menyusul (S5).
5. Preset warna langsung dikerjakan sampai slider + filter (S4 dimajukan ke S1); LUT menyusul.
6. Desain UI lewat Claude Design.

## 7. Cara menampilkan ke TV
Aplikasi stage membuka **dua jendela**: layar operator di laptop, dan jendela TV layar penuh di layar kedua. Yang penting, Windows harus melihat TV sebagai **layar kedua (Extend)**. Caranya bisa salah satu:

| Cara | Kabel di lantai | Butuh internet | Catatan |
|---|---|---|---|
| **HDMI biasa** | Ada | Tidak | Paling stabil |
| **HDMI nirkabel (pemancar + penerima)** ⭐ | Tidak | Tidak | Colok pemancar ke laptop, penerima ke TV. Windows melihatnya seperti HDMI biasa, jadi tidak perlu aplikasi atau WiFi venue. **Saran untuk pelaminan** |
| **Miracast** (Win+K → Extend) | Tidak | Tidak (koneksi langsung) | TV/dongle harus mendukung Miracast; kadang patah-patah dan bisa putus |
| Chromecast / AirPlay | Tidak | Ya | Tidak disarankan: Windows tidak bisa "extend" ke Chromecast, dan bergantung pada WiFi venue |

Kalau TV terputus di tengah acara, layar operator tetap jalan dan menampilkan "TV tidak tersambung". Jendela TV otomatis kembali saat layar kedua muncul lagi.
