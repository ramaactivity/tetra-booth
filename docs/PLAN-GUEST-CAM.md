# Rencana Guest Cam

Status: **keputusan produk dari owner** (7 Okt 2026, §6). Progres: G1 selesai (e836db7), G2 selesai dengan UI sementara (CORS R2 PUT dari browser disetel Rama 7 Okt). Produk B2C eksklusif Tetra (tidak dijual ke vendor SaaS). Pola kerja sama dengan Photo Stage: kode inti dulu dengan UI sederhana yang mengikuti token v2, lalu tampilan final diganti sesuai desain Claude Design. Latar bisnis: `riset-bisnis-2026-10/competitors-b2c.md` §B dan §D (Guest Cam Digital Rp750rb sebagai add-on; pembeda Tetra = satu album bersama foto booth dan Photo Stage).

## 1. Alur tamu

```
Kartu QR di meja / layar TV / undangan
 → HP tamu buka booth.tetraphoto.com/c/{slug-event}   (web, tanpa install, tanpa login)
 → isi nama + WhatsApp atau Instagram + centang persetujuan (sekali per HP)
 → kamera HP (depan/belakang), pilih filter event, jepret; sisa jatah tampil ("12 foto lagi")
 → foto diunggah di belakang layar (antre & coba ulang kalau sinyal jelek)
 → opsional: rekam ucapan suara (maks 30 detik) dan buat strip virtual dari 2–4 fotonya
 → reveal "langsung": tamu lihat fotonya sendiri + album acara
   reveal "setelah acara": tamu cuma lihat hitungan; semua foto terbuka saat owner/acara selesai
```

Foto tamu masuk album yang sama dengan booth dan Photo Stage: tab **Guest Cam** di galeri klien `/g`, tampil di live slideshow `/live`, dan bisa dimoderasi di dashboard event admin.

## 2. Model data (migrasi 0026, aditif)

| Perubahan | Alasan |
|---|---|
| `sessions.source` CHECK tambah `'guest'` | Satu tamu = satu sesi (pola Photo Stage, #178). Semua galeri, purge, ZIP, dan moderasi sesi langsung ikut. |
| `sessions.device_id` boleh NULL (CHECK: wajib kecuali `source='guest'`) | Tamu tidak punya device. Query booth tetap memfilter device miliknya. |
| `sessions.guest_key_hash text` | Hash dari kunci acak di cookie HP tamu; mengikat browser ke sesinya tanpa login. |
| `assets.kind` CHECK tambah `'audio'` | Ucapan suara. Strip virtual memakai kind `strip_web`/`thumb_strip` yang sudah ada. |
| `assets.review_status text` (`null` = tampil, `'pending'`, `'rejected'`) | Mode "perlu approval". `hidden_at` tetap untuk sembunyikan manual. |
| `events.guest_token text unique` | Link QR Guest Cam bisa dicabut/dibuat ulang tanpa mengganggu link klien/live (pola `live_token`, slug `/c/{slug}` seperti #147). |
| `events.guest_revealed_at timestamptz` | Saat foto "setelah acara" dibuka (otomatis saat Hentikan Acara/lewat tanggal, atau tombol owner). |
| `leads.data` tambah kunci `instagram` (bukan kolom) | Lead tamu Guest Cam = baris `leads` dengan `session_id` sesi tamu. |
| `analytics_events.type` tambah `guest_join`, `guest_shot` | Statistik Guest Cam di dashboard. |

Setelan per event di `EventSettingsSchema.guestCam` (`packages/shared/src/event.ts`): `enabled`, `shots` (jatah, default 15), `reveal` (`live` / `after`), `approval` (`auto` / `manual`), `voice` (on/off), `strip` (on/off), `contact` (`whatsapp_or_instagram`), `filters` (pakai daftar filter event yang sama).

## 3. API publik (apps/web, tanpa login, rate limit `rateOk` per IP + per sesi)

| Endpoint | Fungsi |
|---|---|
| `GET /api/c/{token}` | Info event untuk halaman tamu: nama, tanggal, branding, filter, jatah, reveal, voice/strip aktif, desain strip. 404 kalau Guest Cam mati / link dicabut / kedaluwarsa. |
| `POST /api/c/{token}/join` | Nama + WA/IG + persetujuan → buat sesi `guest` + lead, set cookie kunci (httpOnly). Idempoten: HP yang sama dapat sesi yang sama. |
| `POST /api/c/{token}/sign` | Minta URL unggah R2 untuk 1 foto (original + thumb) / audio / strip. Server cek jatah (jumlah original) dan tipe file sebelum menandatangani. |
| `POST /api/c/{token}/done` | Catat aset setelah PUT; server cek ukuran objek di R2 (HEAD) ≤ batas (foto 8 MB, audio 2 MB), hapus kalau melanggar. |
| `GET /api/c/{token}/me` | Foto/audio/strip milik tamu ini + sisa jatah (untuk lanjut setelah HP ditutup). |

Kunci R2 sama dengan booth: `{org}/{event}/sessions/{id}/{kind}_{idx}.{ext}` → purge, ZIP, dan masa simpan tidak perlu diubah.

## 4. Halaman tamu `/c/[token]` (mobile web)

- Kamera: `getUserMedia` (pola restart track dari `booth-core/src/camera/webcam.ts`), ganti depan/belakang, layar penuh, tombol rana besar.
- Filter: `PHOTO_FILTERS` dari `@tetra/shared`. Diterapkan ke piksel sebelum unggah (bukan `ctx.filter`, karena iOS Safari tidak konsisten) → satu fungsi murni baru di `packages/shared` yang dites.
- Hasil: original sisi panjang 2400 px JPEG + thumb 480 px, dikompres di HP.
- Antrean unggah di IndexedDB: foto tidak hilang kalau sinyal putus atau tab ditutup; lanjut otomatis saat online.
- Ucapan suara: `MediaRecorder` (webm/opus; mp4/aac di iOS), maks 30 detik, dengar ulang sebelum kirim, 1 per tamu.
- Strip virtual: tamu pilih foto sesuai jumlah slot desain utama event → render di HP lewat `packages/template-engine` (`browserContext`, sama seperti `DesignPreview`) → unggah `strip_web` + `thumb_strip`. Tidak ada engine kedua (aturan #2).
- Semua teks di `lib/copy.ts`, token dari `packages/ui/src/tokens.css`.

## 5. Admin, galeri, live

- **Pengaturan event → Guest Cam** (section baru setelah Photo Stage): on/off, jatah, reveal, approval, ucapan suara, strip virtual, link + QR (salin, cabut, buat ulang), unduh **kartu QR meja** (PDF A6 siap cetak).
- **Dashboard event:** angka Guest Cam (tamu ikut, foto, ucapan), antrean **Perlu disetujui** saat mode manual (setujui/tolak per foto, pilih banyak), tombol **Buka foto sekarang** saat reveal "setelah acara".
- **Galeri klien `/g`:** chip **Guest Cam** (dikelompokkan per tamu, nama tampil) dan **Ucapan** (pemutar audio). Mengikuti pola tab Photo Stage (#191).
- **Live slideshow:** foto tamu ikut berputar setelah reveal + approval; ditandai "oleh {nama}".
- **Export lead CSV:** tambah kolom instagram + sumber (halaman tamu / Guest Cam).
- **Ops API:** `modules` tambah `"guest_cam"` kalau event punya Guest Cam aktif.

## 6. Keputusan owner (7 Okt 2026)

1. Isi v1: inti (kamera HP, jatah, filter booth, album bersama) **+ ucapan suara + strip virtual**. Cetak foto tamu di lokasi **belum** (menyusul).
2. Reveal **diatur per event**: langsung atau setelah acara.
3. Tamu isi **nama + WhatsApp atau Instagram** (database tamu). Persetujuan UU PDP wajib (teks dari setelan Lead event).
4. Moderasi **diatur per event**: tampil otomatis (bisa disembunyikan) atau harus disetujui dulu.

## 7. Tahapan

| Tahap | Isi | Selesai bila |
|---|---|---|
| **G1** Data + API | Migrasi 0026, `EventSettingsSchema.guestCam`, filter piksel di shared, endpoint §3, uji Vitest + uji API | Uji lulus; jatah & batas ukuran ditolak server |
| **G2** Halaman tamu inti | `/c/[token]`: form, kamera, filter, jatah, antrean unggah, foto saya | Playwright (kamera palsu Chromium) lulus; dicoba di iPhone + Android asli |
| **G3** Suara + strip | Rekam ucapan, strip virtual lewat template engine | Unggah audio & strip tampil di galeri |
| **G4** Admin + galeri + live | Section pengaturan, kartu QR, dashboard + approval, tab galeri, live, CSV, Ops modules | Alur penuh owner → tamu → klien lulus e2e |
| **G5** Desain final | Desain dibuat owner di Claude Design **paralel dengan G1** (meta prompt `handoff/claude-design-guest-cam/`). Kalau desain sudah ada saat G2–G4, UI langsung dibangun sesuai desain; kalau belum, UI sederhana dulu lalu diganti | Sama dengan PNG |
| **G6** Uji lapangan | 1 event Tetra asli (gratis sebagai bonus) | ≥ 90% tamu yang join berhasil unggah, tanpa keluhan kamera |

## 8. Risiko

- **iOS Safari:** izin kamera hilang tiap tab dibuka ulang, `MediaRecorder` beda format, memori kecil untuk foto besar → kompres bertahap, uji di iPhone asli sejak G2.
- **Penyalahgunaan link publik:** rate limit per IP/sesi, jatah ditegakkan server, batas ukuran, link bisa dicabut, mode approval.
- **Kuota R2 & masa simpan:** ±200 tamu × 15 foto × ~1,5 MB ≈ 4,5 GB per acara besar. Masih dalam tier gratis untuk beberapa event/bulan; masa simpan mengikuti event (purge yang sama).
- **Prioritas:** board Ops↔Booth mencatat prioritas Booth = kestabilan mode event sampai Jan 2027. Guest Cam dikerjakan atas permintaan owner (7 Okt); perbaikan booth event tetap didahulukan kalau ada laporan dari lapangan.
