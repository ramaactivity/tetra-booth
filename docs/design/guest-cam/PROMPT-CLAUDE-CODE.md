# Prompt untuk Claude Code: bangun UI Guest Cam (Tetra Booth)

> Cara pakai: salin isi folder ini ke `tetra-booth/docs/design/guest-cam/` di repo, lalu tempelkan semua teks di bawah garis sebagai prompt pertama di Claude Code.
> Desain dibuat 7 Okt 2026 untuk tahap G5 (`docs/PLAN-GUEST-CAM.md`). Backend G1 (schema, API `/api/c/[token]`) sudah ada.

---

Bangun UI **Guest Cam** di `apps/web` sesuai desain di `docs/design/guest-cam/`. Data dan API sudah ada di `packages/shared/src/guest-cam.ts` dan `apps/web/app/api/c/[token]/*`. Tugas ini hanya UI dan sambungannya ke API. Kontrak API jangan diubah, kecuali ada yang memang kurang. Kalau begitu, catat di DECISIONS.

## Sumber kebenaran (urutan prioritas)
1. `Guest Cam Spesifikasi.dc.html`: ukuran dasar, 10 komponen baru beserta state-nya, durasi gerak, matriks setelan → tampilan, dan keputusan terbuka.
2. File desain `*.dc.html`. Buka di browser bersama `support.js` di folder yang sama. Semua style ditulis inline, jadi baca nilainya langsung dari markup. Cari layar lewat `data-screen-label="A3 Kamera"` dan sejenisnya.
   - `Guest Cam Prototipe.dc.html`: alur tamu A1–A10 yang bisa diklik. Logic class di bagian bawah file menunjukkan perilaku yang dituju: jeda rana 380 ms, kilat 150 ms, film maju, validasi form, timer ucapan 30 detik, pemilih strip.
   - `Guest Cam HP Tamu.dc.html`: semua state statis A2–A10, termasuk izin ditolak, browser dalam aplikasi, sinyal lemah, moderasi, terkunci, dan link tidak berlaku.
   - `Guest Cam Arah Desain.dc.html`: arah yang dipilih adalah **pembuka 1a + kamera 1b**.
   - `Guest Cam Kartu TV Galeri.dc.html`: B11 kartu QR meja (PDF A6), C12 live TV, D13 galeri klien (tab Guest Cam dan Ucapan).
   - `Guest Cam Admin.dc.html`: E14 pengaturan Guest Cam, E15 dashboard dengan antrean "Perlu disetujui" (papan ketik A/X/←→, Shift untuk pilih banyak).
3. `docs/design/08-desain.md` (sistem desain v2) dan `packages/ui/src/tokens.css`. **Jangan menambah hex baru.** Semua warna di desain sudah memakai token.

## Pemetaan ke kode
| Desain | Tempat |
|---|---|
| A1–A10 | `apps/web/app/c/[token]/` (page + komponen di `components/guest-cam/`) |
| FilmCounter, FilterPill, UploadPill, LastShot, ShotFlyout, ContactField, ConsentRow, VoiceRecorder, StripPicker | `apps/web/components/guest-cam/*.tsx` (nama sesuai Spesifikasi §2) |
| ModerationGrid, section setelan | `apps/web/app/admin/(app)/events/[id]/…` mengikuti pola section Photo Stage |
| Kartu QR meja | PDF A6 105×148 mm, 300 dpi, QR asli dengan finder membulat (`QrCode` di booth-core) |
| Galeri tab Guest Cam / Ucapan | `apps/web/app/g/…`, pola tab Photo Stage (#191) |
| Live | `apps/web/app/live/…`, bingkai polaroid dan pil "oleh {nama}", kartu ajakan tiap 6 slide |
| Copy | `apps/web/lib/copy.ts` dengan kunci `guestCam.*`, pakai persis teks di desain |

## Aturan penting
- Di atas viewfinder **tidak boleh ada transparansi, blur, atau gradient**. Pakai pil solid dengan garis tinta.
- Pratinjau filter boleh memakai `style.filter` dari `filterCss()`. Piksel yang diunggah **wajib** diproses `applyPhotoFilter()` (iOS Safari).
- Tidak ada hapus atau ulang foto. Setiap jepretan memakai jatah, dan `idx` disimpan di IndexedDB supaya kirim ulang tetap idempoten.
- `reveal=after`: HP hanya menampilkan hitungan, tidak ada thumbnail. Strip baru bisa dibuat setelah dibuka (keputusan terbuka #1).
- `approval=manual`: tamu tetap melihat fotonya sendiri dengan label "Ditinjau".
- Target sentuh ≥ 48 px. Tombol utama ada di sepertiga bawah layar. Layar paper tidak boleh scroll di 390×844, dan tetap harus muat di 360×740.
- `prefers-reduced-motion`: semua durasi 0, kilat diganti pil "Tersimpan".
- Foto di desain adalah contoh. Ganti dengan data asli dari `GET /api/c/{token}/me`.
- **QR di desain adalah pola hiasan.** Ganti dengan QR asli.

## Cara kerja
1. Baca Spesifikasi, lalu `guest-cam.ts`, `filters.ts`, dan endpoint di `app/api/c/[token]`.
2. Bangun per tahap: G2 (A1–A7 + antrean unggah), lalu G3 (A8 ucapan, A9 strip lewat `template-engine`), lalu G4 (E14, E15, B11, D13, C12).
3. Untuk tiap layar, render di viewport yang sama (390×844@2x, 360×740, 1440, 1920×1080) dan bandingkan dengan file `.dc.html`. Perbaiki spacing, font, border, dan lapisan sampai sama.
4. Tambah uji Playwright (kamera palsu Chromium) di `e2e/guest-cam.spec.ts` untuk alur A1 → jatah habis, dan untuk mode after/live/manual.
5. Sebelum memakai copy yang menjanjikan kabar WhatsApp (A5/A7b), cek keputusan terbuka di Spesifikasi §5. Kalau pengirimannya belum ada, hapus kalimat itu.
