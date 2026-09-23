# 08 — Arah Desain Booth & Halaman Tamu

Referensi: Photo Place. Minimalis, clean, banyak ruang kosong, satu aksen warna. Yang tampil menonjol adalah **foto tamu dan branding acara**, bukan UI-nya.

Berlaku untuk: layar booth, halaman tamu, galeri klien, live slideshow. Admin memakai gaya netral yang sama (shadcn/ui dengan token ini), tanpa tema event.

## 1. Prinsip

1. **Satu aksi utama per layar.** Tamu tidak pernah bingung harus tekan apa.
2. **UI mundur, foto maju.** Warna netral, foto & live view mengambil porsi terbesar.
3. **Tema dari event.** Aksen, logo, dan font display diambil dari branding event. Tanpa branding, pakai default Tetra.
4. **Tenang, bukan ramai.** Tanpa gradient, emoji, ilustrasi dekoratif, shadow tebal, atau animasi memantul.

## 2. Token

| Token | Default | Catatan |
|---|---|---|
| `--bg` | `#F6F4F1` (putih hangat) | Bisa diubah per event |
| `--surface` | `#FFFFFF` | Kartu, panel |
| `--fg` | `#1A1714` | Teks utama |
| `--muted` | `#8A847D` | Teks sekunder, label |
| `--line` | `#E4E0DA` | Garis tipis 1px |
| `--accent` | `#8E2A1E` (maroon) | **Diganti warna event.** Tombol utama, timer, highlight |
| `--on-accent` | `#FFFFFF` | Teks di atas aksen (hitung kontras otomatis) |
| `--radius` | 6px | Kecil, rapi |

Kontras teks minimal WCAG AA. Jika warna aksen event kurang kontras dengan `--bg`, sistem menggelapkan aksen otomatis.

## 3. Tipografi

Semua peran memakai satu keluarga sans: **Geist**. Tanpa serif (keputusan owner, lihat DECISIONS.md #1).

| Peran | Font default | Gaya |
|---|---|---|
| Display (nama acara, judul besar) | Geist | Besar, weight 500–600, letter-spacing rapat (-0.02em); bisa diganti font/logo event |
| Label & tombol | Geist | UPPERCASE, letter-spacing 0.18em, weight 500–600 |
| Body | Geist | Normal, 16–18px di booth |
| Angka (countdown, timer) | Geist, tabular | Countdown sangat besar & tipis (weight 200–300) |

## 4. Komponen booth

- **Tombol utama:** blok solid `--accent`, tinggi ≥ 72px, label uppercase berspasi. Satu per layar.
- **Tombol sekunder:** outline 1.5px `--fg`, latar transparan.
- **Timer sesi:** pill kecil `--accent` di kanan atas, angka `mm:ss`.
- **Logo event:** kiri atas, kecil. Di attract screen boleh besar di tengah.
- **Live view:** full-bleed atau kartu besar dengan radius kecil; countdown di tengah di atas live view.
- **Grid review:** foto dalam kartu putih dengan padding tipis, nomor kecil di pojok; foto yang bisa di-retake punya ikon ulang kecil.
- **Pilihan layout (photobox):** kartu preview strip sungguhan (dirender template engine), nama + harga di bawah, border aksen saat dipilih.
- **Layar QR:** QR besar di kartu putih, satu kalimat instruksi, tombol SELESAI.
- Target sentuh minimal 64×64px; jarak antar target ≥ 16px.

## 5. Gerak

- Transisi layar: fade + geser 12px, 250ms, ease-out.
- Hasil foto setelah capture: muncul dengan fade 200ms, tanpa efek flash berlebihan (cukup layar putih 120ms sebagai "flash").
- Tidak ada animasi yang membuat tamu menunggu lebih lama.

## 6. Tata letak & orientasi

- Landscape 1920×1080 dan portrait 1080×1920 didesain terpisah, bukan sekadar diputar.
- Margin luar besar (≥ 64px landscape, ≥ 48px portrait). Konten utama di tengah.

## 7. Copy

- Bahasa Indonesia santai, pendek, jelas: "Sentuh untuk mulai", "Siap? Senyum!", "Mau ulang foto ini?", "Scan untuk simpan fotomu".
- Label tombol maksimal 2 kata.

## 8. Halaman tamu & galeri klien

- Mengikuti token & tipografi yang sama agar terasa satu produk dengan booth.
- Mobile-first: strip memenuhi lebar layar, tombol SIMPAN solid aksen menempel di bawah (sticky).
- Galeri klien: hero dengan cover event + nama acara dalam font display, grid rapat dengan jarak tipis, header waktu sticky.
- Footer kecil "by Tetra Photobooth" — satu-satunya tempat brand Tetra muncul di layar tamu.
