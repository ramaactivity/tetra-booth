# Handoff: Photo Stage (Tetra Booth)

## Overview
Photo Stage adalah fitur Tetra Booth untuk foto rombongan di pelaminan. Fotografer memotret dengan kamera yang di-tether ke laptop stage, foto otomatis dikelompokkan per rombongan, lalu TV di jalur turun menampilkan foto + QR. Tamu scan QR untuk menyimpan fotonya, klien melihat semua foto per rombongan di galeri.

Paket ini menggantikan **UI sementara** yang sudah jalan (S1–S5, #178–#184). Logika (`StageRunner`, `capture.shot`, upload `source: "stage"`, `groupName`, cetak 4R, LUT) **tidak berubah**. Yang diganti hanya tampilan, ditambah beberapa perilaku UI baru yang ditandai **[baru]**.

| Bagian | Perangkat | File desain |
|---|---|---|
| A1–A4 Laptop stage | Electron, kanvas 1920×1080 (diskalakan `Stage` ke 1366×768) | `Photo Stage A - Laptop Stage.dc.html` (+ `Photo Stage Operator`, `Photo Stage Warna`) |
| B4–B6 TV | Jendela kedua, 1920×1080 layar penuh | `Photo Stage B - TV.dc.html` (+ `Photo Stage TV`) |
| C7–C8 HP tamu | Next.js, 390 | `Photo Stage C - HP Tamu.dc.html` |
| D9 Galeri klien | Next.js, 1440 + 390 | `Photo Stage D - Galeri Klien.dc.html` |
| E10 Admin | Next.js, 1440 | `Photo Stage E - Admin.dc.html` |
| Cetak 4R | Template engine, 1800×1200 @300 dpi | `Photo Stage Frame 4R.dc.html` |
| Spesifikasi ringkas | — | `Photo Stage - Spesifikasi.dc.html` |

## About the Design Files
File `.dc.html` adalah **referensi desain dalam HTML**: prototipe yang menunjukkan tampilan dan perilaku yang dituju, **bukan kode produksi**. Tugasnya **membangun ulang** desain ini di codebase `tetra-booth` (Electron + React + Tailwind untuk booth/TV, Next.js untuk web) dengan token di `packages/ui/src/tokens.css`, komponen `@tetra/ui`, `booth-core/src/ui.tsx` (`Stage`, `Steps`, `QrCode`, `Done`) dan aturan di `docs/design/08-desain`.

Cara membuka: taruh semua file `.dc.html` + `support.js` + folder `foto/` di satu folder, buka di browser. File A–E adalah kanvas (bisa pan/zoom). `Photo Stage Operator`, `Photo Stage TV`, `Photo Stage Warna` dan `Photo Stage Frame 4R` adalah komponen yang dipakai file A/B dan bisa dibuka sendiri. Semua style inline, jadi baca nilainya langsung dari markup.

Yang interaktif di prototipe: A1 (langkah wizard), A2 (⏎, Spasi, Tab, J = simulasi jepret, tombol simulasi kamera/TV/offline, cetak, riwayat, Warna), A4 (slider, filter, LUT), B6 (rombongan baru masuk, kembali ke galeri, 1–5 foto, tanpa animasi), C7 (geser, simpan), C8/D9 (tab, cari, jam, unduh), E10 (daftar grup, impor, ganda, simpan).

## Fidelity
**High-fidelity.** Warna, tipografi, radius, border, kartu berlapis, spacing dan copy sudah final. Pengecualian:
- Foto adalah potongan foto contoh (`foto/stage/*`, `foto/strip/*`), ganti dengan foto asli sesi.
- QR adalah pola dekoratif, ganti dengan `QrCode` asli (URL `/s/{id}` untuk rombongan, galeri event untuk idle).
- Glyph sementara (⇆, ▦, ▶, ✓, ›) → ikon `lucide-react` di posisi/ukuran yang sama.
- Logo "T tetra" → logo resmi bila ada.
- Tombol/baris bertanda "demo" / "SIMULASI" (garis putus abu-abu) hanya untuk prototipe, **jangan dibangun**.

## Pemetaan ke kode
| Layar | Kode yang ada (UI sementara) |
|---|---|
| A1 Persiapan | crew menu / booth-flags (`role: "stage"`), `apps/booth/src/main/stage.ts` |
| A2–A3 Operator | `packages/booth-core/src/StageRunner.tsx`, `stage.ts` |
| A4 Warna | `stageImage.ts` (filter string + LUT `.cube`) |
| B4–B6 TV | `packages/booth-core/src/StageTv.tsx`, `apps/booth/src/main/stage-tv.ts` |
| C7–C8, D9 | halaman tamu & galeri di `apps/web`, `apps/web/lib/stage-groups.ts` |
| E10 | Pengaturan event (E3) di `apps/web` admin |
| Cetak 4R | template engine (frame event satu slot) |

E2E yang perlu disesuaikan: `apps/booth/e2e/stage.spec.ts`, `apps/web/e2e/photo-stage-web.spec.ts`.

## Screens

### A1 Persiapan (1920×1080)
- Header: logo, pill lavender "Mode Crew", stepper 5 langkah kanan (lingkaran 42, b2.5; selesai hijau ✓, aktif ink + angka putih, belum putih; penghubung 44px solid/putus-putus). Padding 44/64/48, gap 32.
- Judul 68/800 -0.035em + subjudul 24 `#5F5E5A`.
- Langkah:
  1. **Peran & event**: kiri 640 = 2 kartu pilihan Booth/Stage (r28, pad 26/30, judul 32/800). Kanan = daftar event (r24, judul 28/800, meta mono 18, pill status). Terpilih = isian `#D6F1EA` + lapis 8 mint. Catatan sky putus-putus: "Laptop booth dan laptop stage memakai event yang sama. Semua foto masuk satu album."
  2. **Kamera**: kartu "Canon · otomatis" (EDSDK, detail "Canon EOS R6 · USB · baterai 82%") dan "Folder pantau" (Sony, Lumix, Fujifilm, Nikon; path mono `C:\Tetra\Stage\Masuk`). Kanan 820 = kotak foto tes: sebelum = putus-putus "Jepret 1 foto tes"; sesudah = foto + ✓ hijau "Foto tes masuk" + mono "19.02.44 · 6000 × 4000 · 8,4 MB".
  3. **TV**: kartu layar (thumbnail 120×72 berisi nomor layar), tombol sekunder "Tampilkan uji di TV" ↔ "Matikan uji" + konfirmasi mint-soft. Kanan: kartu sky putus-putus "TV harus muncul sebagai layar kedua" (Win + P → Perluas) + HDMI nirkabel (disarankan) / HDMI biasa / Miracast.
  4. **Warna**: panel `Photo Stage Warna` (zoom 0.74), tombol utama "Pakai untuk semua foto" lanjut ke langkah 5.
  5. **Pemisah**: kartu "Otomatis setelah jeda" (stepper −/+ 72 tinggi, 15–180, bawaan 45) dan "Mati". Kanan: ringkasan "Siap mulai" (baris ✓ hijau: Peran, Event, Kamera, TV, Warna, Pemisah, Daftar grup).
- Footer: Kembali/Batal (sekunder, h92, r24) kiri; CTA butter kanan (h100, r26, 30/800): "Lanjut ke Kamera / TV / Warna", "Mulai Photo Stage".

### A2 Operator (1920×1080), layar terpenting
Padding 32/40, gap 24. Grid utama `1fr 452px`, gap 32.
- **Header 64**: logo, pill "Photo Stage" lavender, "Wedding Rina & Dimas" 20/800 + mono "12.12.2026 · 12/40 grup". Kanan: **StatusBar** = satu pill b2 h52 bersegmen (pemisah 1.5 ink): Kamera (Canon R6) · TV · Upload (n antre) · Internet. Dot 12px: hijau `#5DB978` OK, butter/peach peringatan, `#E8836F` rusak. Segmen bermasalah berisi peach/coral. Lalu tombol Warna dan Crew (h52, r14, b2).
- **Banner masalah [baru]** (h≥60, r18, b2.5) di bawah header, satu sekaligus. Prioritas: kamera (coral) > jeda (peach, + keycap Spasi) > TV (peach) > offline (sky). Copy di bagian Copy.
- **Kartu rombongan aktif**: putih, b3, r36, lapis 12 mint (`box-shadow: 12px 12px 0 -3px #8EDCCB, 12px 12px 0 0 #1D1D1B`), pad 32/40/28.
  - Kiri atas: label mono 16 "ROMBONGAN" + "#47" 84/800 -0.05em lh .85.
  - Isian nama: h76, r20, b2.5, 34/800 -0.02em, placeholder "Tamu · HH.MM", focus ring 4px mint. Label "Nama grup" + petunjuk halus kanan: keycap "Tab" (mono 13, b1.5 `#8A8883`) "isi dari daftar".
  - **Grid foto** `1.15fr 1fr`, gap 24, mengisi tinggi: foto terbaru besar di kiri ("· terbaru"), foto lain 2×2 di kanan, sel terakhir = slot "Foto berikutnya / masuk otomatis dari kamera" (putus-putus `#8A8883`) selama < 5 foto. Kartu foto = bingkai cetak putih: b2.5, r18, pad 12/12/0, img r8 cover; strip bawah h60 (kecil h54) berisi jam mono + **PrintButton**. Kartu besar diberi lapis 6.
  - Kosong: kotak putus-putus "Menunggu jepretan fotografer" 34/800.
  - Footer (garis atas putus-putus): "3 foto · jepretan terakhir 7 dtk lalu", bar mint (sisa pisah otomatis), "dipisah otomatis dalam 38 dtk". Saat pisah otomatis mati / jeda, teks berubah, lihat Copy.
  - **Baki "Belum dikelompokkan" [baru]** (peach, b2.5, r20) menggantikan footer kalau ada foto masuk saat jeda: thumb 84×56 + tombol "Masukkan ke #47" / "Jadi rombongan baru" / "Sembunyikan" (putus-putus).
- **Kolom kanan** (gap 20):
  - Kartu QR (r28, pad 14): QR 110 + "QR rombongan #47", nama (maks 2 baris), catatan "Untuk tamu yang minta langsung ke crew" (TV mati: "TV mati: arahkan tamu scan di sini"). QR = rombongan aktif kalau sudah ada foto, kalau belum = rombongan terakhir.
  - **Berikutnya dari daftar**: judul 20/800 + mono "12/40", bar mint 8px, 5 baris h36 (nomor mono, nama, "Tab" di baris 1), catatan 1 baris "Klik = pasang ke #47, atau buka rombongan baru".
  - **Riwayat**: baris h52 (thumb 57×38, nama 16/700, mono "#46 · 4 foto · 19.40", pill upload: terunggah mint-soft / mengunggah sky / antre peach). Jumlah baris: 3, atau 2 saat ada banner; kalau satu baris terbuka, hanya baris itu yang tampil. Kartu bisa di-scroll sebagai pengaman. Baris terbuka [baru]: isian ganti nama, thumb 48×32 yang bisa dipilih (ring mint 3px; foto tersembunyi opacity .35 + label "tersembunyi"), tombol "Gabung ke #45", "Pisah n foto", "Sembunyikan / Tampilkan lagi".
- **Bar bawah h100**: "Rombongan baru" butter (h96, r24, b3, 30/800, lapis 8) + keycap "⏎ Enter"; "Jeda" ↔ "Lanjut" (putih ↔ mint) + keycap "Spasi". Kanan: "Pisah otomatis", stepper −/45 dtk/+ (h64, r18), toggle Aktif/Mati.
- **Toast** ink pill di tengah atas (19/700), 2,2 dtk, untuk konfirmasi aksi ("Rombongan #48 dibuka. QR #47 tampil di TV").
- Dialog Warna: overlay `rgba(29,29,27,.42)` + panel A4 di tengah.

### A3 Status bermasalah
Varian A2 (`scenario`): kamera terputus (segmen coral, slot coral "Kamera terputus"), foto masuk saat jeda (baki), TV tidak tersambung, offline (upload 12 antre, riwayat "antre"), rombongan kosong, edit riwayat. Tidak ada state yang memblokir layar.

### A4 Warna (panel 1640×880)
Putih, b3, r36, pad 36, grid `1fr 540px`, gap 40.
- Kiri: foto tes b2.5 r20 dengan pembanding sebelum/sesudah: lapisan "sesudah" di-clip dari garis geser, garis putih 3px + tombol bulat 52 "⇆", pill "Sebelum" (putih) / "Sesudah" (mint-soft). Keterangan mono "foto tes · 19.02.44 · Canon R6".
- Kanan: judul 34/800 "Warna foto stage", baris LUT (h60, r16; nama file mono; Hapus; "Pilih file .cube" lavender; isian mint-soft saat ada LUT, coral saat error), pesan error coral putus-putus, catatan "LUT dipakai dulu, lalu filter dan slider."; segmented 5 filter (aktif mint); 4 slider −50…+50 (track 8 b1.5, isian mint dari tengah, knob 26 b2.5, angka mono "+12"); baris preset + "Simpan preset"; Kembalikan (sekunder) + Selesai / "Pakai untuk semua foto" (butter), h80 r22.
- Filter CSS prototipe (perkiraan, pakai definisi `PHOTO_FILTERS` yang ada): Hitam Putih `grayscale(1)`, Hangat `sepia(.18) saturate(1.1) hue-rotate(-6deg)`, Pudar `contrast(.86) brightness(1.06) saturate(.8)`, Vintage `sepia(.35) contrast(.92) saturate(.85)`.

### B4 TV aktif (1920×1080)
Grid `1fr 560px`. Kiri pad 72/0/64/88: mono 28 "Rombongan #47 · 19.42", nama grup 104/800 -0.05em lh .95 (92 kalau > 24 huruf, `text-wrap: balance`). Area foto 1220×600:
- 1 foto tunggal, 2 berdampingan, 3 = 1 besar + 2 bertumpuk, 4 = 2×2, 5 = 1 besar + 2×2. Semua 3:2. Gap 32.
- Bingkai: putih, b3, r20, pad 14, img r8, lapis 10, miring −1 / 1.2 / −0.6 / 0.8 / −1.2°.
Kolom kanan putih, garis kiri 3, pad 64/64/48, gap 22: kartu QR (pad 28, r36, lapis 14 butter, zona tenang putih ≥ 2 modul), "Scan untuk ambil fotomu" 52/800, bar sisa waktu (8px, mint), lalu "Rombongan sebelumnya" + 2 baris (garis atas putus-putus, QR 88, mono #46, nama 26/800).

### B5 TV idle
Kiri atas: pill lavender "The Wedding of", "Rina & Dimas" 150/800 -0.055em, tanggal mono 26. Kanan atas: kartu sky (b2.5, r28) QR 150 + "Belum dapat fotomu?" 30/800 + "Cari di sini". Bawah (tinggi 520, 84 dari bawah): deretan cetakan 600×400 + strip nama/jam (h62) bergeser ke kiri, loop 90 dtk, miring ±1.2°.

### B6 Transisi
Idle ↔ aktif: opacity + translateY 12→0, 250 ms ease-out (dua lapisan selalu ter-mount). Rombongan baru saat aktif: konten kiri fade 160 ms, ganti data, fade in. Sisa waktu 30 dtk (setelan), bar berkurang linear per detik, lalu kembali ke idle. Tanpa animasi: semua 0 ms, galeri idle diam (ganti foto per 8 dtk).

### C7 Halaman rombongan (390×844)
Pad atas 44, sisi 20. Event 15/800 + tanggal mono 12, logo T 32. "Rombongan #47 · 19.42 · 3 foto" mono 13, nama 30/800. Carousel scroll-snap, kartu 342 (b1.5, r18, pad 10, lapis 5), foto 3:2, strip h50: "1 / 3" + "Simpan" (h34) → "Tersimpan ✓". Titik progres 16px tersambung garis. Kartu link "Lihat semua foto acara · Cari nama grup atau jam" (ikon putus-putus peach). Bawah sticky (garis atas putus-putus): "Simpan semua (3 foto)" butter h56 → "Menyiapkan 3 foto…" → "Tersimpan ke galeri HP ✓" (Web Share `files`, fallback unduh ZIP); "Tersedia sampai 11 Jan 2027" + "Powered by Tetra Photobooth" 11px.

### C7b Foto masih dikirim [baru]
Placeholder bergaris + spinner "Foto sedang dikirim…", timeline 3 langkah (Difoto di pelaminan ✓ · Dikirim ke sini 1 dari 4 · Siap disimpan), catatan sky: "Halaman ini terbuka sendiri saat foto siap. Tidak perlu scan ulang, cukup biarkan terbuka." Tombol Simpan semua disabled (putus-putus). Butuh polling/SSE.

### C8 Galeri acara (390)
Header tetap (garis bawah): "Rina & Dimas" 22/800, meta mono "12 Desember 2026 · 47 rombongan", segmented Photobooth / Photo Stage (aktif lavender, h44), cari (h46), chip jam (h34, aktif lavender, klik = scroll ke bagian). Daftar per jam: judul 18/800 + mono jumlah, kartu rombongan (b1.5, r18, pad 12): nama 16/800, "#47 · 19.42", 3 thumb 3:2. Kosong: kartu putus-putus "'xyz' belum ketemu" + penjelasan "Tamu · jam". Tab Photobooth: grid 2 kolom strip.

### D9 Galeri klien (1440 + 390)
Mengikuti C1 v2: hero foto 440 + kartu info (pill "The Wedding of", 64/800, Tanggal/Venue/Foto). Toolbar satu kartu (r20): segmented Photobooth 212 / Photo Stage 47, cari (280), chip jam, retensi, "Unduh semua Photo Stage" (sky → peach "Menyiapkan ZIP · 38%" → mint "ZIP siap ✓"), "▶ Putar Slideshow" butter. Isi per jam (pill lavender) → per rombongan: nama 22/800, mono "#47 · 19.42", garis putus-putus, "3 foto", "Unduh rombongan" (→ "Menyiapkan ZIP…" → "Terunduh ✓"); grid 4 kolom 3:2 r12. HP: hero 300, tab, cari, rombongan dengan thumb 2 kolom + "Unduh", bar bawah Slideshow / Unduh semua.

### E10 Admin · Photo Stage (1440)
Sidebar 236 dan kartu bagian mengikuti E3 v2. Chip lompat bagian (Photo Stage = lavender). Kartu "Photo Stage" + pill paket + toggle "Aktif untuk event ini".
- Catatan sky putus-putus (hanya kalau datang dari Ops): **"Diisi dari daftar klien di Tetra Ops (n grup)"** · disinkron … · "Buka di Ops ↗".
- Grid `1fr 300px`: textarea "Daftar grup" (h360, 14/1.7, satu grup per baris, urutan = urutan "Berikutnya") + "n grup · maks 120 karakter per nama". Kanan: "Impor CSV / TXT" (sekunder, lapis 4; kolom pertama dipakai, baris kosong & judul kolom dilewati), konfirmasi mint "5 grup ditambahkan dari tamu-vip.csv", peringatan peach nama ganda + "Hapus ganda", "Kosongkan daftar" (coral putus-putus).
- Baris setelan: Pisah otomatis bawaan (45 dtk · 15–180), Lama tampil di TV (30 dtk), Frame cetak 4R ("Lengkung · Rina & Dimas" + Ganti).
- Panel simpan sticky peach: "Perubahan belum disimpan" → "Tersimpan", Simpan butter, status sinkron laptop stage.

### Frame cetak 4R (1800×1200)
Putih. Foto inset 44 kiri/atas/kanan, 150 bawah, cover, `object-position: 50% 35%`. Lengkung putih tengah bawah: lebar `min(1300, max(820, 520 + panjang(nama1+nama2) × 52))`, tinggi 300, `border-radius: w/2 w/2 0 0`, naik ±150 px ke foto. Isi (Cormorant Garamond, `#2A2926`): "The Wedding of" italic 36 `#6B6862`; "Rina & Dimas" 96/500 lh 1.02, "&" italic 400 `#8A8578`; tanggal "12 · 12 · 2026" 28/500 tracking .32em. Data dari event (tagline opsional, nama, tanggal). Dipakai saat event tidak punya frame 4R sendiri.

## Interactions & Behavior
- **Keyboard** (window, tidak aktif saat dialog Warna terbuka): ⏎ = rombongan baru (diabaikan + toast kalau rombongan aktif kosong); Spasi = Jeda/Lanjut; Tab = isi nama dari baris pertama "Berikutnya" (preventDefault, juga di dalam isian); Esc = tutup dialog/baris riwayat. Di isian nama, ⏎ = blur.
- **Klik "Berikutnya"**: nama kosong → dipasang ke rombongan aktif; kalau sudah ada nama dan foto → rombongan baru dibuat dengan nama itu. Grup terpakai hilang dari daftar, hitungan x/40 naik saat rombongan bernama ditutup.
- **Pisah otomatis**: kalau aktif dan tidak jeda, rombongan ditutup `autoSec` detik setelah jepretan terakhir. Toast "Jeda 45 dtk lewat. Rombongan #48 dibuka".
- **Cetak**: 1 klik = 1 lembar. Selama mencetak tombol tidak bisa diklik. Gagal → coral "Gagal · ulangi". Sudah dicetak → klik lagi mencetak lagi ("Dicetak 2× ✓").
- **Jeda**: foto masuk ke "Belum dikelompokkan", tidak ke rombongan aktif. Operator memutuskan lewat baki.
- **Riwayat**: satu baris terbuka sekaligus. Gabung = semua foto pindah ke rombongan sebelumnya. Pisah = foto terpilih jadi rombongan baru `#nb` bernama "Tamu · jam" (minimal 1 foto tersisa). Sembunyikan = foto terpilih tidak tampil di halaman tamu/galeri, toggle "Tampilkan lagi".
- **Tamu**: carousel scroll-snap; Simpan semua pakai Web Share API, fallback unduh. Foto belum masuk → C7b + polling.
- **Pencarian** (C8, D9): `includes` tanpa beda huruf besar, pada `group_name`.
- Tombol berlapis ditekan: translate(4px,4px) + offset 0, 100 ms.

## State Management (garis besar UI)
- Operator: `no`, `name`, `photos[{src,t,print:'idle'|'printing'|'done'|'failed',prints}]`, `paused`, `unsorted[]`, `autoOn`, `autoSec`, `lastShotAt`, `next[]`, `doneCount`, `history[{no,name,photos[{src,hidden}],time,upload}]`, `openHist`, `sel[]`, `device{camera,tv,online,queue}`, `toast`, `warnaOpen`.
- TV: `mode:'idle'|'aktif'`, `current`, `prev[2]`, `remain`.
- Warna: `filter`, `values{b,c,s,w}` (−50…50), `lut:'none'|'ok'|'broken'|'big'`, `preset`.
- Web: `tab`, `q`, `hour`, `zip{group|all: idle|busy|done}`. Admin: `text`, `source:'ops'|'manual'`, `dirty`, `saved`.

## Design Tokens
Tidak ada warna baru. Pakai `tokens.css`: ink `#1D1D1B`, paper `#F8F7F4`, white, butter `#F8D98B` (aksi utama), mint `#8EDCCB`, mint-soft `#D6F1EA`, lavender `#CEC8F6`, peach `#FCE3C6`, sky `#D6EEF8`, coral `#F7D5CC` / `#E8836F`, green `#5DB978`, neutral `#EFEDE8`, text-2 `#5F5E5A`, text-3 `#3A3936`, muted `#8A8883`, line-soft `#D6D3CC`. Overlay dialog `rgba(29,29,27,.42)`.
Khusus frame cetak: `#2A2926`, `#6B6862`, `#8A8578` (abu hangat untuk serif).
Font: Plus Jakarta Sans + Geist Mono untuk UI; **Cormorant Garamond hanya untuk frame cetak** (branding acara, disengaja).
Radius & ukuran: lihat `Photo Stage - Spesifikasi.dc.html` §2.
Gerak: 250 ms ease-out (TV idle↔aktif), 160 ms (ganti rombongan), 100 ms (tekan), toast 2,2 dtk, galeri 90 dtk/putaran.

## Copy (pakai persis)
Rombongan baru · Jeda · Lanjut · Nama grup · isi dari daftar · Berikutnya dari daftar · Riwayat · Belum dikelompokkan · Masukkan ke #n · Jadi rombongan baru · Sembunyikan · Cetak 4R · Mencetak… · Dicetak ✓ · Gagal · ulangi · Pisah otomatis · Aktif · Mati
Banner: "Kamera terputus. Menyambung ulang…" + "Foto yang sudah masuk tetap aman. Cek kabel USB atau aplikasi tether." · "Dijeda." + "Foto yang masuk ditampung di "Belum dikelompokkan"." · "TV tidak tersambung." + "Tamu tetap bisa scan QR di layar ini. TV tampil lagi otomatis saat tersambung." · "Offline." + "n rombongan antre, terkirim otomatis saat online. Foto tersimpan di laptop."
TV: "Scan untuk ambil fotomu" · "Rombongan sebelumnya" · "Belum dapat fotomu? Cari di sini"
Tamu: "Simpan semua (n foto)" · "Lihat semua foto acara" · "Foto sedang dikirim…" · "Halaman ini terbuka sendiri saat foto siap. Tidak perlu scan ulang, cukup biarkan terbuka."
Nama otomatis: "Tamu · 19.42".

## Assets
- `foto/stage/a1–a3, b1–b2, c1–c2.png`: potongan 3:2 dari foto contoh (teks/frame/ornamen dibuang), hanya untuk prototipe.
- `foto/strip/s1–s6.png`: strip photobooth contoh "Rina & Dimas" (frame dibuat di prototipe).
- QR dekoratif dibuat di JS; ganti dengan `QrCode`.
- Ikon: `lucide-react`.


## Screenshots
Folder `screenshots/` berisi render tiap layar di ukuran asli (laptop/TV 1920×1080 @1x, desktop 1440 @1x, HP 390 @2x). **Bandingkan implementasi dengan PNG ini.**

| ID | File |
|---|---|
| A1 | `A1-persiapan.png` (langkah 1) |
| A2 | `A2-operator.png` |
| A3 | `A3a-kamera-terputus.png`, `A3b-jeda-belum-dikelompokkan.png`, `A3c-tv-tidak-tersambung.png`, `A3d-offline.png`, `A3e-rombongan-kosong.png`, `A3f-edit-riwayat.png` |
| A4 | `A4-warna.png` |
| B4 | `B4-tv-aktif-1-foto.png` … `B4-tv-aktif-5-foto.png` |
| B5 | `B5-tv-idle.png` |
| C7–C8 | `C7-halaman-rombongan.png`, `C7b-foto-masih-dikirim.png`, `C8-galeri-acara.png` |
| D9 | `D9-galeri-klien-desktop.png`, `D9m-galeri-klien-hp.png` |
| E10 | `E10-admin-photo-stage.png` |
| Frame | `F-frame-4r-lengkung.png` |

Langkah A1 lain, dialog terbuka, dan state interaktif lain: buka file `.dc.html`.

## Files
- `Photo Stage A - Laptop Stage.dc.html`, `Photo Stage Operator.dc.html`, `Photo Stage Warna.dc.html`
- `Photo Stage B - TV.dc.html`, `Photo Stage TV.dc.html`
- `Photo Stage C - HP Tamu.dc.html`
- `Photo Stage D - Galeri Klien.dc.html`
- `Photo Stage E - Admin.dc.html`
- `Photo Stage Frame 4R.dc.html`
- `Photo Stage - Spesifikasi.dc.html`
- `00-PROMPT-CLAUDE-CODE.md`: prompt siap tempel untuk Claude Code
- `screenshots/`: render PNG tiap layar
- `support.js` (runtime pembuka file desain, jangan dipakai di produksi), `foto/`
