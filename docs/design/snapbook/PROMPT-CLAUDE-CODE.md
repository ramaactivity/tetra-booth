# Prompt untuk Claude Code — pasang Snapbook (frame foto + kartu QR)

> Cara pakai: salin folder `export/` ini ke repo `tetra-booth`, misalnya di `docs/design/snapbook/`. Lalu tempel semua teks di bawah garis ke Claude Code.

---

Kamu akan memasang hasil desain **Snapbook** di repo `tetra-booth`. Semua aset ada di `docs/design/snapbook/` (folder hasil export). Desain ini sudah disetujui owner. **Pasang persis seperti file, jangan menggambar ulang atau "merapikan" desainnya.** Kalau ada yang tidak bisa dipasang persis, berhenti dan jelaskan alasannya sebelum mengubah apa pun.

Sebelum mulai, baca `CLAUDE.md`, `docs/design/v2/README.md`, dan kode `@tetra/template-engine`.

## 1. Frame foto: 15 gaya × 3 ukuran = 45 frame

Isi `frames/`:
- `_index.json`: daftar 45 frame dengan `id`, `name`, `style`, `paper`, `category` (`wedding` / `analog` / `playful` / `netral`), `sortOrder`, dan jumlah slot.
- `frames/<id>/<id>.json`: layout untuk `@tetra/template-engine`, formatnya sama dengan contoh di spesifikasi teknis (canvas, background, overlay, slots, texts).
- `frames/<id>/<id>-bg.png`: latar penuh kanvas, tidak transparan.
- `frames/<id>/<id>-overlay.png`: PNG transparan dengan lubang tepat di area slot.
- `frames/<id>/<id>-preview.png`: contoh jadi (setengah resolusi). **Hanya untuk dibandingkan, jangan dipakai di produksi.**

Tugas:
1. Import ke-45 frame sebagai **frame bawaan Tetra**. Frame ini muncul di semua acara, di samping frame buatan klien. Pakai mekanisme aset/template yang sudah ada; jangan membuat format baru.
2. Kanvas: Strip 2R 600×1800 (`paper: "2x6x2"`), 4R 1200×1800 (`"4R"`), Polaroid 900×1200 (`"3x4x2"`). Semua 300 dpi.
3. Urutan lapisan sesuai spesifikasi: background → slot (`below_overlay`) → overlay → teks (`above_overlay`).
4. **Slot berotasi.** Beberapa slot di gaya `zine` memakai `rotation` (derajat, searah jarum jam, poros di tengah slot). Pastikan engine sudah mendukungnya. Kalau belum, tambahkan dukungannya.
5. **Placeholder tanggal baru.** Selain `{event_name}` dan `{date}` (YYYY-MM-DD), JSON memakai dua placeholder baru yang perlu ditambahkan ke engine:
   - `{date_long}` → "10 Oktober 2026" (bulan dalam bahasa Indonesia). Dipakai semua gaya wedding.
   - `{date_dot}` → "10.10.26" (DD.MM.YY). Dipakai gaya `mono`, `photobox`, dan `majalah`.
6. **Font teks dinamis** (semua sudah ada di daftar font engine): `lib-plus-jakarta-sans-800-normal`, `lib-plus-jakarta-sans-500-normal`, `lib-dm-mono-400-normal`, `lib-pinyon-script-400-normal`, `lib-bodoni-moda-500-normal`, `lib-dm-serif-display-400-normal`, `lib-reenie-beanie-400-normal`.
7. **Teks panjang** tetap satu baris dan dipadatkan horizontal agar muat lebar `w`. Jangan dipotong dan jangan dibungkus ke baris baru. Uji dengan "Ulang Tahun ke-17 Nadhira Putri Ramadhani".
8. Koordinat `y` teks di JSON adalah **tepi atas kotak baris dengan line-height 1** (hasil desain di browser). Kalau engine memaknai `y` sebagai cap-height, sesuaikan sekali secara global di engine, bukan per file.
9. **Verifikasi visual.** Render ke-45 frame memakai foto contoh dan nama "Wedding Rafi & Dinda", lalu bandingkan dengan `<id>-preview.png` (diperkecil 50%). Posisi slot, overlay, dan teks harus sama. Simpan hasil perbandingan di PR.

### Pemilih frame di HP (390×844)

Bangun layar "Bikin frame" di halaman tamu (Snapbook), mengikuti `sumber-desain/Snapbook Presentasi.dc.html` bagian *Pemilih frame di HP*:
- Header: tombol kembali, judul "Bikin frame", subjudul "N dari M fotomu dipakai", dan pill jumlah foto (mint-soft).
- Segmented control **Strip 2R / 4R / Polaroid** (aktif = lavender), mengikuti pola tab Strip/Original/Animasi di B01. Ukuran dipilih dulu karena menentukan jumlah slot.
- Pratinjau besar yang memakai foto tamu sendiri. Kartunya berlapis (offset 8px, border tinta 1.5px).
- Nama gaya + posisi ("3/15 · 4 foto"), lalu deretan thumbnail gaya yang bisa digeser horizontal. Urutannya mengikuti `sortOrder`, dan gaya wedding tampil paling depan di acara nikahan. Thumbnail terpilih: border tinta 2px, isian mint-soft, lapisan 4px.
- CTA butter "Pakai frame ini", dan di bawahnya "Bisa langsung dicetak di booth" (hanya kalau paket acara termasuk cetak).
- Kalau foto tamu lebih sedikit dari jumlah slot: slot kosong tampil sebagai placeholder bergaris, dan CTA berubah jadi "Pilih N foto lagi".
- Geser kiri/kanan di pratinjau = ganti gaya.
- Pakai token dan komponen `@tetra/ui`. Jangan menambah hex baru.

## 2. Kartu QR: 10 konsep × (A5 + kartu nama depan & belakang) = 30 file

Isi `kartu-qr/`:
- `kartu-qr-template.html`: berisi 30 `<section class="card" data-card="<konsep>-<a5|front|back>">`. Setiap kartu memakai ukuran asli dalam mm, dengan inline style dan font Google Fonts.
- `preview/<konsep>-<sisi>.png`: contoh jadi 300 dpi dengan data contoh dan QR palsu. **Hanya untuk dibandingkan.**
- `assets/cover-contoh.jpg`: foto sampul untuk kartu `majalah`. Ganti dengan foto Tetra yang bagus dan berizin.

Placeholder di template: `{event_name}`, `{date}`, `{date_long}`, `{date_dot}`, `{shots}`, `{frame_no}`, `{qr_src}`.
- QR adalah `<img id="qr" src="{qr_src}">`. Ukurannya sudah final: ≥35 mm di A5 dan ≥22 mm di kartu nama, di atas latar putih dengan quiet zone ≥2 mm. Isi dengan PNG/SVG QR asli dari komponen `QrCode` yang sudah ada, warna gelap di atas terang.
- Baris kondisional `id="if-voice"` dan `id="if-frame"`: hapus elemennya kalau fitur mati. `{frame_no}` = 5 kalau voice aktif, 4 kalau tidak.
- Elemen `data-fit` dipadatkan horizontal oleh `snapFit()` di template. Jalankan setelah font selesai dimuat.

Tugas:
1. Buat generator kartu, misalnya `apps/web` route admin atau script `tools/`. Generator mengambil data acara, mengisi placeholder, lalu **merender ke PDF vektor** per kartu dengan Playwright:
   - A5: `page.pdf({ width: '148mm', height: '210mm', printBackground: true })`.
   - A6: render A5 lalu skala 105/148 (rasionya identik), atau pakai `scale` di Playwright.
   - Kartu nama: `{ width: '96mm', height: '61mm' }` (90×55 + bleed 3 mm). Depan dan belakang jadi dua halaman.
2. **Catatan format:** brief awal meminta SVG. Desain diserahkan sebagai template HTML karena teks dinamis, font, dan pemadatan teks paling akurat dirender oleh browser. PDF vektor dari Playwright tetap tajam di percetakan digital, dan teksnya tetap teks. Kalau percetakan wajib SVG, tambahkan ekspor PDF→SVG (misalnya `pdftocairo -svg`) dan beri tahu owner.
3. Font kartu (Google Fonts, gratis): Plus Jakarta Sans, DM Mono, Bodoni Moda, Pinyon Script, Newsreader, UnifrakturMaguntia, Bricolage Grotesque, Reenie Beanie. Untuk render offline di server, pakai fontsource.
4. **Verifikasi visual.** Render 30 kartu dengan data contoh (`Wedding Rafi & Dinda`, `10 Oktober 2026`, 15 foto, voice + frame aktif), lalu bandingkan dengan `preview/*.png`. Uji juga nama panjang dan kombinasi fitur mati.
5. Di admin acara, tambahkan pilihan konsep kartu QR. Urutan: `zamrud, renda, pita, teater, koran` (formal/wedding), lalu `majalah, musik, kartupos, kamera, tiket`.

## 3. Sumber desain

`sumber-desain/` berisi file desain asli: `SnapFrame.dc.html`, `SnapCard.dc.html`, dan `Snapbook Presentasi.dc.html`. Kalau ada nilai yang ragu (warna, ukuran, posisi), nilai inline di file ini yang benar. Urutan rujukannya: **file sumber → JSON/template → preview PNG**.

## 4. Data contoh

- Nama pendek: "Wedding Rafi & Dinda". Nama panjang: "Ulang Tahun ke-17 Nadhira Putri Ramadhani".
- Tanggal: 2026-10-10. Kuota: 15 foto per tamu. Voice note dan bikin frame aktif.
- Instagram: @tetraphotobooth.

## 5. Definisi selesai

- 45 frame muncul di pemilih frame, sudah dirender oleh engine, dan cocok dengan preview.
- Hasil cetak 2R/4R/polaroid di printer booth punya zona aman 30 px dan tidak ada yang terpotong.
- Generator kartu menghasilkan PDF A5, A6, dan kartu nama untuk 10 konsep, dengan QR asli yang bisa discan dari jarak 1 m dalam cahaya redup.
- Placeholder `{date_long}` dan `{date_dot}` sudah ada di engine, beserta test-nya.
- Catat keputusan baru di `docs/DECISIONS.md` (frame bawaan Snapbook, placeholder tanggal baru, format kartu = PDF dari template HTML).
