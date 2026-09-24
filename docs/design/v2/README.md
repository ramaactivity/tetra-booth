# Handoff: Tetra Booth v2 — UI seluruh platform

## Overview
Tetra Booth adalah platform photobooth pengganti LumaBooth milik Tetra Photobooth (Indonesia). Paket ini berisi desain UI v2 untuk 5 surface:

| Surface | Perangkat | File |
|---|---|---|
| A. Booth App | Kiosk touchscreen Windows 1920×1080 landscape (Electron) | `Tetra Booth v2 A - Booth App.dc.html` |
| B. Halaman Tamu | Mobile web 390px | `Tetra Booth v2 B - Halaman Tamu.dc.html` |
| C. Galeri Klien | Responsive web 390px + 1440px | `Tetra Booth v2 C - Galeri Klien.dc.html` |
| D. Live Slideshow | TV/proyektor 1920×1080 | `Tetra Booth v2 D - Live Slideshow.dc.html` |
| E. Admin | Desktop web 1440px | `Tetra Booth v2 E - Admin.dc.html` |

Konteks produk lengkap: `reference/01-PRD.md` (tujuan, aktor, Mode Event vs Mode Photobox, metrik) dan `reference/tetra-booth-stitch-prompts.md` (spesifikasi per layar).

## About the Design Files
File `.dc.html` di paket ini adalah **referensi desain yang dibuat dalam HTML** — prototipe statis yang menunjukkan tampilan dan isi yang dituju, **bukan kode produksi untuk disalin langsung**. Tugasnya adalah **membangun ulang desain ini di codebase target** (mis. Electron + React untuk booth, Next.js/React untuk web tamu, galeri, dan admin) memakai pola dan library yang sudah ada di codebase. Jika belum ada codebase, pilih framework yang paling cocok (saran: monorepo dengan React + Tailwind/CSS variables, satu paket UI bersama untuk token & komponen).

Cara membuka: taruh file `.dc.html` bersama `support.js` di folder yang sama, buka di browser. Tiap file adalah kanvas yang menampilkan semua layar berdampingan; tiap layar diberi label ID (A1, B2, E8, …) dan atribut `data-screen-label`. Semua style ditulis inline — baca nilainya langsung dari markup.

## Fidelity
**High-fidelity.** Warna, tipografi, radius, border, bayangan, spacing, dan copy sudah final. Implementasi harus mengikuti desain sepresisi mungkin. Pengecualian:
- Semua foto adalah placeholder bergaris → ganti dengan foto/live view asli.
- QR di desain adalah pola dekoratif → generate QR asli (mis. `qrcode` lib) dengan finder pattern sudut membulat.
- Ikon memakai glyph Unicode sementara (◷ ▦ ▭ ⇄ ☺ ⚑ ✓ ↓ ↗ ♥) → ganti dengan satu set ikon outline konsisten (mis. Lucide/Phosphor, stroke 1.5–2px) dengan posisi & ukuran yang sama.
- Logo "T / tetra" adalah placeholder wordmark → ganti dengan logo resmi bila ada.

## Design Tokens

### Warna
| Token | Hex | Pemakaian |
|---|---|---|
| `ink` | `#1D1D1B` | Semua garis, teks utama, timer pill, badge ID |
| `paper` | `#F8F7F4` | Latar layar |
| `white` | `#FFFFFF` | Kartu, input |
| `canvas` | `#EDECE8` | Latar kanvas presentasi (bukan bagian UI) |
| `butter` | `#F8D98B` | **Aksi utama** (CTA), nav aktif admin |
| `mint` | `#8EDCCB` | Terpilih / aktif, toggle ON, focus ring, progress |
| `mint-soft` | `#D6F1EA` | Latar kartu terpilih, status Berlangsung/Online/Berhasil |
| `lavender` | `#CEC8F6` | Label mode, tab aktif, status Mendatang |
| `peach` | `#FCE3C6` | Baris Total, peringatan ringan, kedaluwarsa |
| `sky` | `#D6EEF8` | Info, catatan offline, badge Mode Event |
| `coral` | `#F7D5CC` | Aksi destruktif sekunder (Nonaktifkan, Hapus, Tutup Aplikasi), status Gagal |
| `coral-strong` | `#E8836F` | Tombol konfirmasi hapus permanen |
| `green` | `#5DB978` | Lingkaran centang "selesai" (teks putih) |
| `text-2` | `#5F5E5A` | Teks sekunder |
| `text-3` | `#3A3936` | Teks isi |
| `muted` | `#8A8883` / `#9A9892` | Placeholder, disabled |
| `line-soft` | `#D6D3CC` | Divider putus-putus antar baris tabel |
| `neutral` | `#EFEDE8` | Status Selesai/Kedaluwarsa |

Aturan: teks selalu `ink` di atas pastel (tidak ada teks berwarna pastel). Status = pill ber-border `ink` + isian pastel.

### Tipografi
- **Plus Jakarta Sans** (Google Fonts, 400/500/600/700/800) — seluruh UI.
- **Geist Mono** (400/500) — timer, ID transaksi/sesi, tanggal format `12.10.2026`, kode pairing, URL, angka di chart.
- Tidak ada serif.

| Peran | Booth 1920 | Admin/Web | Weight | Tracking |
|---|---|---|---|---|
| Display (nama event attract) | 176px / lh .92 | 72px (galeri desktop) | 800 | -0.05em |
| H1 layar | 72–84px | 28–30px | 800 | -0.035em |
| H2 / judul kartu | 30–44px | 15–20px | 800 | -0.02em |
| Body | 26–32px | 13–14px | 500–600 | 0 |
| Caption | 20–22px | 11–12px | 600–700 | 0 |
Minimum teks booth 20px (terbaca dari 2 m).

### Border & Radius
- Border: booth `2.5px solid ink` (hero card 3px); web/admin/mobile `1.5px solid ink`.
- Dashed: `2px dashed ink` (booth) / `1.5px dashed ink` (web) untuk divider di dalam kartu, kotak ikon, drop zone, catatan info, state disabled.
- Radius booth: tombol 20–28px, kartu 24–40px, frame 28px. Web: input/tombol 11–14px, kartu 16–22px, mobile frame 40px. Pill: 999px.

### Bayangan "kartu berlapis" (ciri utama)
Lapisan kedua bergaris di belakang kartu, dibuat dengan dua box-shadow:
```css
/* booth */  box-shadow: 8px 8px 0 -2.5px var(--under, #F8F7F4), 8px 8px 0 0 #1D1D1B;
/* web   */  box-shadow: 4px 4px 0 -1.5px var(--under, #FFFFFF), 4px 4px 0 0 #1D1D1B;
```
`--under` = warna lapisan belakang (default warna latar; kartu stat/device memakai pastel untuk variasi). Offset: tombol booth 7–8px, hero card 10–16px, web 4–6px. Dipakai pada: CTA utama, tombol sekunder, kartu penting, modal. Tabel dan kartu isi biasa **tidak** memakai offset (hanya border).

### Spacing
Booth: padding layar 64–96px, gap grid 32–48px, tinggi tombol 92–136px. Admin: sidebar 236px, padding konten 32–40px, gap 16–20px, tinggi baris tabel 50–62px, input 42–48px.

## Komponen inti (buat sebagai komponen bersama)
1. **Button** — `primary` (butter + offset), `secondary` (putih + offset), `ghost` (border saja), `destructive` (coral, dashed/solid), `dark` (ink, teks putih). Primary booth boleh diakhiri lingkaran mint berisi panah (A1).
2. **Card** — border ink, radius, opsi `layered` (offset shadow) dan `under` color. Opsi header dengan divider putus-putus.
3. **Stepper** — lingkaran 36–44px: selesai = hijau + ✓, aktif = ink + angka putih, belum = putih + angka; penghubung solid (selesai) / putus-putus (belum). Dipakai A2, A5, B2, SYS.
4. **IconTile** — kotak radius 12–16px, border dashed ink, isian pastel, ikon di tengah.
5. **StatusPill** — pill ber-border ink + isian pastel sesuai status.
6. **SegmentedControl** — grup tombol dalam satu border ink, pemisah garis ink, item aktif lavender.
7. **Toggle** — track ber-border ink, ON = mint, knob putih ber-border.
8. **Input** — border ink 1.5px, focus = `box-shadow: 0 0 0 3px #8EDCCB`.
9. **SummaryTable** (A3, A7) — baris dipisah dashed, baris Total isian peach dengan border atas solid.
10. **TimerPill** — ink, teks putih Geist Mono, "Sisa waktu 04:32".
11. **Sidebar admin** — putih, border kanan ink; item aktif = butter + border ink.

## Screens
Semua copy Bahasa Indonesia sudah final — pakai persis seperti di file. Ringkasan per layar (detail ukuran ada di markup):

### A. Booth App (1920×1080)
- **SYS** — papan token visual (referensi, bukan layar produk).
- **A1 Attract** — kiri: pill "The Wedding of", nama event display 176px, tanggal mono, CTA butter "Sentuh untuk Mulai" (680×136) dengan lingkaran mint →. Kanan: 3 kolom strip contoh berlapis, offset vertikal berbeda, idealnya bergerak lambat (loop vertikal). Hotspot crew tak terlihat 72×72 di pojok kanan atas (tap berulang/tahan → PIN A9). Lingkaran dekoratif mint/peach di sudut.
- **A2 Pilih Layout** (photobox) — header: logo · stepper Layout/Bayar/Foto/Cetak · timer. 4 kartu layout (preview proporsional slot, nama, meta, harga). Terpilih = isian mint-soft, offset mint, lencana ✓ hijau. Tombol Kembali / Lanjut ke Pembayaran.
- **A3 QRIS** — 2 frame: (1) *Membuat QR…* spinner, (2) QR siap + "QR berlaku 04:58". Kiri latar sky dengan kartu QR; kanan ringkasan pesanan (Total peach), 3 langkah bernomor, status "Menunggu pembayaran…", tombol Batalkan. **Tidak ada tombol konfirmasi manual** — deteksi otomatis via webhook/polling Xendit.
- **A4** — Berhasil (✓ hijau, auto-lanjut 3 detik) / Kedaluwarsa (Buat QR Baru, Kembali ke Awal).
- **A5** — live view penuh layar; pill progres "Foto 2 dari 4" + stepper; thumbnail samping (selesai / aktif butter / belum dashed); angka countdown dalam lingkaran putih 340px ber-offset mint. Frame "Cekrek!" = flash putih + kartu butter.
- **A6 Review** — 4 foto; "Ulangi" per foto; setelah diulang → state dashed disabled "Sudah diulang (1/1)". CTA "Pakai Semua Foto".
- **A7 Jumlah cetak** — preview 4R kiri, stepper −/angka/+ (tombol + mint). Mode Event: "Gratis, maksimal 4 lembar" + Cetak Sekarang. Mode Photobox: tabel tambahan + Cetak 1 Saja / Bayar & Cetak (→ QRIS lagi).
- **A8 Cetak + QR** — kiri peach: preview + progress bar mint. Kanan: judul, chip ✓ Strip/Original/Animasi, QR 340px, catatan offline (sky dashed), Selesai + auto-kembali 20 detik.
- **A9 Crew** — PIN pad (4 digit, kotak aktif ring mint) dan dashboard: kartu Kamera, Printer, Koneksi, Sesi hari ini; grid aksi; "Tutup Aplikasi" coral (butuh konfirmasi); CTA "Keluar ke Mode Tamu".
- **A10 Kamera terputus** — kartu tenang, spinner, "percobaan N", jaminan "Foto yang sudah diambil tetap aman". Tanpa kode error.
- **A11 (baru) Printer bermasalah** — cetakan antre otomatis, tamu tetap bisa scan QR.

### B. Halaman Tamu (390px)
- **B1** — header event + logo; segmented Strip/Original/Animasi; carousel swipe; tombol bawah sticky: Simpan Semua Original + **Simpan ke Galeri HP** (Web Share API `navigator.share({files})`, fallback download); kartu link galeri event; retensi + powered by.
- **B2 Lagi dikirim** — placeholder + spinner, timeline 3 langkah; realtime (SSE/WebSocket/polling) agar muncul tanpa refresh.
- **B3 Kedaluwarsa** — pesan + kartu promosi peach "Hubungi Tetra Photobooth".
- **B4 Lead capture** — bottom sheet di atas strip ter-blur; Nama, WhatsApp, consent wajib (UU PDP); Lihat Fotoku; Lewati hanya jika event mengizinkan.

### C. Galeri Klien
- **C1** mobile & desktop — hero cover dengan kartu info putih; toolbar (Slideshow butter, Download Semua, Pilih, Favorit); bar retensi; chip lompat per jam; bagian per jam dengan masonry (2 kolom mobile, 4 desktop), foto radius 10–12px + border ink.
- **C2 Lightbox** — latar paper (terang); counter mono; aksi segmented Favorit/Download/Bagikan/Tutup; desktop ada panah prev (putih) / next (mint) + filmstrip (aktif = ring mint).
- **C3 Pilih → ZIP** — centang hijau per foto, bar bawah Download ZIP + ukuran; frame progress ZIP.
- **C4 Pengaturan** — bottom sheet: toggle Galeri publik, salin link, tanggal penghapusan.
- **C5 Temukan Foto Saya** (Fase 5) — consent + Ambil Selfie; hasil grid + Download Semua.

### D. Live Slideshow (1920×1080)
- Strip terbaru besar berlapis dengan stiker "Baru!" butter (miring 6°); kolom kanan 4 strip terbaru; kartu QR sky "Scan untuk lihat semua foto"; indikator Live. Transisi masuk strip baru: slide/scale halus ±600ms.

### E. Admin (1440px)
- **E0 (baru) Masuk** — form email/sandi + panel dekoratif kartu ringkas.
- **E1 Daftar Event** — segmented filter status, filter mode, tabel (ikon, badge mode, status pill, retensi).
- **E2 Dashboard Event** — 4 stat card berlapis pastel, bar chart per jam (puncak mint), funnel Sesi → QR dibuka → Disimpan, sesi terbaru + status upload.
- **E3 Pengaturan** — kartu per bagian (Informasi, Mode, Sesi, Halaman tamu, Galeri klien, Device); field yang tidak berlaku untuk mode aktif = dashed/disabled; panel simpan sticky kanan (peach). "Cabut & Buat Ulang Link" butuh konfirmasi.
- **E4 Editor Template** — kiri: format, orientasi, daftar template, upload PNG; tengah: kanvas berpola titik, slot dengan handle mint; kanan: properti slot, urutan layer, daftar slot, teks dinamis.
- **E5 Device** — kartu device (status, event, kamera, printer, kertas, antrean), peringatan kertas, footer aksi tersegmentasi; kode pairing per karakter.
- **E6 Transaksi** — stat cards, filter, tabel dengan status pill, Export CSV.
- **E7 Tim** — tabel anggota (avatar pastel), matriks hak akses (Penuh mint / Lihat sky / Tidak dashed), modal Undang (role sebagai kartu pilihan).
- **E8 Moderasi** — grid foto, bar aksi massal ink, state Disembunyikan, hover aksi; modal hapus (alasan wajib, tombol coral-strong); tab Audit Log sebagai timeline.

## Interactions & Behavior
- Booth: semua target sentuh ≥ 92px tinggi; tidak ada scroll; satu CTA utama per layar. Idle timeout → kembali ke A1. Timer sesi (photobox) wajib; saat habis → langsung ke cetak dengan foto yang ada.
- Tekan tombol: translate(4px,4px) dan kurangi offset shadow ke 0 (efek "ditekan"), 80–120ms ease-out. Hover (web): offset bertambah 1–2px.
- Countdown: angka berganti per detik dengan scale 1.1 → 1; flash putih 150ms saat capture.
- Offline-first: booth menyimpan sesi lokal, antrean upload; QR tetap ditampilkan (URL deterministik per sesi).
- Konfirmasi wajib: Tutup Aplikasi, Cabut Link, Hapus Permanen (alasan wajib → audit log), Nonaktifkan device.

## State Management (garis besar)
- Booth: `mode` (event|photobox), `step` (attract → layout → payment → capture → review → print → qr), `session {id, layout, photos[], retakesUsed[], printQty}`, `payment {status: creating|pending|paid|expired, expiresAt}`, `device {camera, printer, paper, online, uploadQueue}`.
- Tamu: `sessionStatus` (uploading|ready|expired), `leadRequired`, `activeTab`.
- Galeri: `selection Set`, `favorites Set`, `zipJob {progress}`, `isPublic`.
- Admin: CRUD event/template/device/tim; realtime heartbeat device.

## Assets
Tidak ada aset gambar di paket ini. Butuh: logo Tetra Photobooth, set ikon outline, foto contoh untuk attract screen, overlay PNG template.

## Screenshots (referensi visual utama)
Folder `screenshots/` berisi render PNG tiap layar dengan ukuran asli: booth/TV 1920×1080 @1x, admin/desktop 1440 @1x, mobile 390 @2x (780px). **Bandingkan hasil implementasi dengan PNG ini sampai identik.** Kalau PNG dan README berbeda, ikuti file `.dc.html` (nilai inline di sana yang benar), lalu PNG.

| ID | File PNG | Layar |
|---|---|---|
| SYS | `A00-SYS-sistem-visual.png` | Papan token visual |
| A1 | `A01-attract.png` | Attract screen |
| A2 | `A02-pilih-layout.png` | Pilih layout (photobox) |
| A3 | `A03a-qris-membuat.png`, `A03b-qris-menunggu.png` | QRIS: membuat / menunggu |
| A4 | `A04a-bayar-berhasil.png`, `A04b-qr-kedaluwarsa.png` | Hasil pembayaran |
| A5 | `A05a-countdown.png`, `A05b-cekrek.png` | Countdown + flash |
| A6 | `A06-review-retake.png` | Review & retake |
| A7 | `A07a-jumlah-cetak-event.png`, `A07b-jumlah-cetak-photobox.png` | Jumlah cetak per mode |
| A8 | `A08-mencetak-qr.png` | Mencetak + QR |
| A9 | `A09a-crew-pin.png`, `A09b-crew-dashboard.png` | Mode crew |
| A10 | `A10-kamera-terputus.png` | Error kamera |
| A11 | `A11-printer-bermasalah.png` | Printer bermasalah |
| B1–B4 | `B01-sesi-tamu.png` … `B04-lead-capture.png` | Halaman tamu |
| C1 | `C01a-galeri-mobile.png`, `C01b-galeri-desktop.png` | Beranda galeri |
| C2 | `C02a-lightbox-mobile.png`, `C02b-lightbox-desktop.png` | Lightbox |
| C3 | `C03a-mode-pilih.png`, `C03b-menyiapkan-zip.png` | Pilih → ZIP |
| C4 | `C04-pengaturan-galeri.png` | Pengaturan galeri |
| C5 | `C05a-temukan-selfie.png`, `C05b-temukan-hasil.png` | Temukan Foto Saya |
| D1 | `D01-live-slideshow.png` | Live slideshow |
| E0–E8 | `E00-masuk.png` … `E08b-audit-log.png` | Admin |

Catatan: sudut membulat & garis luar di tepi tiap PNG adalah bingkai presentasi. Di produksi, layar booth/TV full-bleed tanpa border luar dan tanpa radius; halaman mobile tanpa bingkai HP.

## Cara kerja yang disarankan untuk Claude Code
1. Baca README ini dan `tokens.css`, lalu siapkan token (CSS variables / Tailwind theme) dan komponen inti (lihat "Komponen inti") lebih dulu.
2. Kerjakan per bagian (A → B → C → D → E). Untuk tiap layar: buka PNG-nya, baca markup layar yang sama di `.dc.html` (cari `data-screen-label="…"`) untuk ukuran persis, lalu bangun.
3. Setelah tiap layar selesai, render di ukuran yang sama dan bandingkan dengan PNG; perbaiki selisih spacing, ukuran font, border, dan offset shadow.
4. Ganti placeholder (foto, QR, ikon, logo) sesuai bagian Fidelity.

## Files
- `tokens.css` — token warna, font, border, radius, dan kelas kartu berlapis, siap dipakai.
- `screenshots/` — 42 PNG referensi (lihat tabel di atas).
- `Tetra Booth v2 A - Booth App.dc.html` … `Tetra Booth v2 E - Admin.dc.html` — desain (buka di browser, perlu `support.js` di folder yang sama).
- `support.js` — runtime untuk membuka file desain (jangan dipakai di produksi).
- `reference/01-PRD.md`, `reference/tetra-booth-stitch-prompts.md` — kebutuhan produk.
