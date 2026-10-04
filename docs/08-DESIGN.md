# 08 — Desain (v2): booth, halaman tamu, galeri, live, admin

**Sumber kebenaran visual:** `docs/design/v2/` (handoff dari owner, 2026-09-24, DECISIONS #45).
- `README.md`: token, komponen, perilaku, dan ringkasan tiap layar.
- `screenshots/*.png`: render tiap layar di ukuran asli. **Implementasi dibandingkan dengan PNG ini sampai sama.**
- `Tetra Booth v2 A…E *.dc.html` (+ `support.js`, buka di browser): nilai inline persis per layar, cari `data-screen-label="A6 Review"` dst. Kalau PNG dan README berbeda, ikuti `.dc.html`, lalu PNG.
- Konteks produk: `docs/01-PRD.md`, spesifikasi per layar: `docs/design/v2/reference/tetra-booth-stitch-prompts.md`.

Dokumen ini merangkum aturan yang wajib diikuti di semua sesi. Kode token ada di `packages/ui/src/tokens.css` (satu-satunya tempat nilai warna/font).

## 1. Prinsip

1. **Satu aksi utama per layar** (tombol butter). Tamu tidak pernah bingung harus tekan apa.
2. **Garis tinta + isian pastel + kartu berlapis.** Semua garis `ink`, teks selalu `ink` di atas pastel (tidak ada teks berwarna pastel).
3. **Tanpa serif.** Plus Jakarta Sans untuk seluruh UI, Geist Mono untuk angka/kode/waktu (keputusan owner, DECISIONS #1).
4. Tanpa gradient, emoji, atau shadow blur. Satu-satunya "bayangan" adalah lapisan berlapis (offset tegas, tanpa blur).
5. Foto tamu & branding event tetap tokoh utama: placeholder bergaris di desain selalu diganti foto/strip asli.

## 2. Token (`packages/ui/src/tokens.css`)

| Token / kelas Tailwind | Hex | Pemakaian |
|---|---|---|
| `ink` | `#1D1D1B` | Garis, teks utama, timer, badge |
| `paper` | `#F8F7F4` | Latar layar |
| `white` | `#FFFFFF` | Kartu, input |
| `butter` | `#F8D98B` | **Aksi utama** (CTA), nav aktif admin |
| `mint` | `#8EDCCB` | Terpilih/aktif, toggle ON, focus ring, progress |
| `mint-soft` | `#D6F1EA` | Latar terpilih, status sukses/online |
| `lavender` | `#CEC8F6` | Label mode (Mode Crew), tab aktif |
| `peach` | `#FCE3C6` | Total, peringatan ringan, kedaluwarsa |
| `sky` | `#D6EEF8` | Info, catatan offline |
| `coral` / `coral-strong` | `#F7D5CC` / `#E8836F` | Destruktif sekunder / konfirmasi hapus |
| `green` | `#5DB978` | Lingkaran ✓ selesai (ikon putih) |
| `neutral` | `#EFEDE8` | Status selesai, latar foto kosong |
| `text-2` / `text-3` / `muted` / `line-soft` | `#5F5E5A` / `#3A3936` / `#8A8883` / `#D6D3CC` | Teks sekunder / isi / placeholder / divider tabel |

Font: `font-sans` = Plus Jakarta Sans Variable, `font-mono` = Geist Mono (keduanya fontsource, jalan offline). Geist tetap dimuat khusus untuk teks strip cetak (template engine), bukan UI. `line-height` dasar `normal` (bukan 1.5 Tailwind).

### Tipografi

| Peran | Booth 1920 | Web/Admin | Weight | Tracking |
|---|---|---|---|---|
| Display (nama event) | 176px, lh .92 | 72px | 800 | -0.05em |
| H1 layar | 68–84px | 28–30px | 800 | -0.035em |
| H2 / judul kartu | 30–44px | 15–20px | 800 | -0.02em |
| Body | 26–32px | 13–14px | 500–600 | 0 |
| Caption | 20–22px | 11–12px | 600–700 | 0 |

Minimum teks booth 20px (terbaca dari 2 m).

### Garis, radius, lapisan

- Border booth `2.5px` (hero 3–4px), web `1.5px`. Putus-putus (`border-dashed`) untuk divider dalam kartu, kotak ikon, catatan info, state disabled.
- Radius booth: tombol 20–28px, kartu 24–40px. Web: input/tombol 11–14px, kartu 16–22px. Pill `rounded-full`.
- **Kartu berlapis** = utility `layered` (tokens.css). Variabel: `--lx` offset (default 8px; tombol 7–8, hero 10–16, web 4–6), `--lb` tebal border elemen (default 2.5px; set sama dengan border), `--under` warna lapisan belakang (default `paper`; kartu status memakai pastel). Contoh: `layered [--lx:14px] [--lb:3px] [--under:var(--mint)]`. Dipakai untuk CTA, tombol sekunder, kartu penting, modal. Tabel & kartu isi biasa **tanpa** lapisan.
- `pressable`: saat ditekan geser 4px ke lapisan belakang (100 ms). `stripes`: placeholder foto bergaris.

## 3. Komponen

- `@tetra/ui` `Button` — varian `primary` (butter + lapisan), `secondary` (putih + lapisan), `plain` (paper, tanpa lapisan), `destructive` (coral putus-putus). Ukuran (tinggi 92–136px booth, radius, font) diberi per layar lewat `className`; untuk menimpa border/justify pakai modifier `!` (mis. `border-[3px]!`), karena urutan kelas Tailwind yang bentrok tidak dijamin.
- `packages/booth-core/src/ui.tsx` — `Logo` (wordmark sementara "T tetra"), `Done` (lingkaran ✓ hijau), `Steps` (stepper: selesai hijau ✓, aktif tinta, belum putih; penghubung solid/putus-putus), `QrCode` (QR asli, finder pattern membulat).
- Ikon: `lucide-react`, stroke 2–2.5 di booth, ukuran & posisi mengikuti glyph di desain.
- Status = pill border tinta + isian pastel (`mint-soft` OK/online, `peach` offline/peringatan, `coral` rusak).
- Komponen web (SegmentedControl, Toggle, Input focus ring mint, Sidebar admin, SummaryTable) dibuat saat layar web-nya dibangun, ikuti README v2 §"Komponen inti".
- **Dropdown & warna di web wajib** `apps/web/components/Select.tsx` (pakai `searchable` untuk daftar nama) dan `ColorPicker.tsx`; jangan `<select>` / `<input type="color">` bawaan browser (DECISIONS #77).

## 4. Pemetaan layar booth (Fase 1, mode event)

| Layar v2 | Kode | Catatan penyesuaian |
|---|---|---|
| A1 Attract | `screens/Attract.tsx` | Pill "The Wedding of" = field opsional `tagline` di bundle event (maks 40 karakter), tidak tampil kalau kosong. Kolom kanan = hasil desain sesi asli event ini (mode event, #143), sebelum ada sesi kartu contoh berbentuk kertas event; 2R 3 kolom, 4R/polaroid 2 kolom; bergerak lambat, mati saat `prefers-reduced-motion`. Hotspot crew 72×72 kanan atas (tap 5×). |
| A5 Countdown / Cekrek | `screens/Countdown.tsx`, `Capturing.tsx`, `PhotoPreview.tsx` | Timer pill hanya mode photobox (Fase 4). Thumbnail selesai = foto asli. Preview antar foto: foto berlapis + pill progres. |
| A6 Review | `screens/Review.tsx` | Kolom = jumlah slot layout. Label aturan & tombol Ulangi hanya jika `retakeMax > 0`. |
| A7 Jumlah cetak (event) | `screens/PrintSelect.tsx` | Kiri = strip hasil compose asli. |
| A8 Cetak + QR | `screens/Qr.tsx` (fase printing & qr) | Progress = perkiraan waktu (`PRINT_SEC_PER_SHEET`), berubah "Sudah tercetak" saat `print.done` sesi ini. Chip hanya Strip & Original (animasi belum ada). |
| A11 Printer bermasalah | `screens/Qr.tsx` (`print === "failed"`) | Tampil saat submit ditolak atau `print.failed` untuk sesi ini. Tanpa tombol; selesai lewat timer. |
| A10 Kamera terputus | `screens/Message.tsx` `CameraError` | "percobaan N" = percobaan sambung ulang. `Message` (kartu + spinner) juga untuk "Menyusun fotomu…". |
| A9 PIN | `crew/PinPad.tsx` | PIN 4–6 digit → kotak bertambah sampai 6, ada tombol OK di bawah keypad. |
| A9 Dashboard crew | `crew/CrewMenu.tsx` | Kartu: Kamera (Camera Service), Printer (kertas + Tes Cetak), Koneksi (antrean upload), Cetak gagal (menggantikan "Sesi hari ini" sampai statistik ada). Aksi: Ganti Event, Ganti Roll Kertas, Ganti PIN, Auto-start, Tutup Aplikasi (konfirmasi), Keluar ke Mode Tamu. |

Belum dibangun (ikuti PNG saat fasenya tiba): A2–A4 & A7 photobox (Fase 4), B halaman tamu (Fase 2), C galeri, D live, E admin (Fase 3).

## 5. Gerak

- Transisi layar: fade + geser 12px, 250ms ease-out (`animate-[enter_…]`).
- Countdown: angka berganti per detik dengan scale 1.1 → 1 (`tick`). Capture: layar putih "Cekrek!" (fade 150ms).
- Tombol ditekan: `pressable`. Tidak ada animasi memantul atau yang membuat tamu menunggu.

## 6. Tata letak & orientasi

- **Kanvas tetap:** semua layar booth dirender di kanvas 1920×1080 (portrait 1080×1920) lalu diskalakan ke layar sebenarnya oleh `Stage` (`booth-core/src/ui.tsx`), jadi ukuran px dari desain dipakai apa adanya dan tetap proporsional di 1366×768, 1920 ber-scaling 125%, atau jendela dev. Sisi yang lebih panjang dari rasio 16:9 melebar, bukan letterbox. Elemen `fixed` di dalamnya terkunci ke kanvas.

- Desain utama landscape 1920×1080. Portrait (1080×1920) memakai varian `portrait:` Tailwind: kolom bertumpuk, dekorasi (kolom strip attract, thumbnail countdown) disembunyikan. Semua layar harus muat tanpa terpotong di kedua orientasi.
- Booth full-bleed: sudut membulat & border luar di PNG hanyalah bingkai presentasi.
- Target sentuh booth ≥ 92px tinggi, tanpa scroll di layar tamu.

## 7. Copy

Semua teks di `packages/booth-core/src/copy.ts`, Bahasa Indonesia santai, pendek, mengikuti copy di desain v2 ("Sentuh untuk Mulai", "Cek fotonya dulu", "Pakai Semua Foto", "Scan untuk simpan fotomu"). Tidak ada kode error di layar tamu; detail teknis hanya di mode crew & log.

## 8. Cara kerja untuk layar baru

1. Buka PNG + markup `.dc.html` layar itu di `docs/design/v2/`.
2. Bangun memakai token & komponen di atas (jangan hex baru di komponen, kecuali abu dekoratif yang ada di markup).
3. Render di ukuran yang sama (Playwright, viewport 1920×1080 / 1440 / 390@2x) lalu bandingkan dengan PNG; perbaiki spacing, ukuran font, border, lapisan sampai sama.
4. Catat penyimpangan yang disengaja di tabel §4 (atau di DECISIONS kalau berdampak perilaku).
