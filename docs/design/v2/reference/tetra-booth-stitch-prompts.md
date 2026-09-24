# Tetra Booth — Prompt Google Stitch per Layar

## Cara pakai

Ada 28 prompt, satu prompt untuk satu layar. Tidak ada instruksi warna, radius, atau font; semua visual mengikuti design.md yang sudah ada di Stitch.

- Prompt ditulis dalam bahasa Inggris supaya Stitch membaca instruksinya dengan akurat. Semua teks UI tetap Bahasa Indonesia dan ditulis dalam tanda kutip.
- Generate layar pertama dari tiap bagian dulu (A1, B1, C1, D1, E1), lalu lanjutkan layar berikutnya di project yang sama supaya konsisten.
- State penting (loading, error, kedaluwarsa) dibuat sebagai prompt terpisah.

| Bagian | Perangkat | Jumlah layar |
| --- | --- | --- |
| A. Booth App | Kiosk touchscreen 1920x1080 landscape | 10 |
| B. Halaman Tamu | Mobile web 390px | 4 |
| C. Galeri Klien | Mobile 390px + desktop 1440px | 5 |
| D. Live Slideshow | TV 1920x1080 | 1 |
| E. Admin | Desktop web 1440px | 8 |

## 0. Prompt Pembuka

Kirim prompt ini pertama kali, bersama screenshot referensi, sebelum A1 sampai E8. Prompt ini mengenalkan seluruh produk ke Stitch dan menghasilkan 3 layar jangkar (booth, halaman tamu, admin) supaya semua layar berikutnya konsisten.

```text
You are designing the full product UI for "Tetra Booth", a photobooth platform built by Tetra Photobooth (Indonesia) to replace LumaBooth. Use the attached design.md as the single source for all visual styling. Do not invent new colors, fonts, corner radius, or shadows outside it.

REFERENCE SCREENSHOTS
I am attaching several screenshots as references. Take from them: layout structure, composition, spacing rhythm, information density, hierarchy, and the overall feel of interactions. Do not copy their text, logos, brand names, or content. If a screenshot conflicts with design.md on visual styling, design.md wins.

THE PRODUCT HAS 5 SURFACES
1. Booth App — Windows kiosk app on a 1920x1080 landscape touchscreen. Used by guests at weddings, corporate events, and pay-per-session photobox booths in malls/cafes. Flow: attract screen → (photobox: choose layout → pay via QRIS) → countdown + live camera → review & retake → print preview + print quantity → printing + QR to get photos. Also has a PIN-protected crew mode for operators (camera, printer, paper, upload queue status).
2. Guest Page — mobile web (390px), opened by scanning the QR at the booth. Shows the guest's strip, original photos, and animation; one-tap save to phone.
3. Client Gallery — mobile-first responsive web (390px and 1440px). All event photos for the wedding couple or corporate PIC, opened via a private link without login. This is a premium product Tetra sells, not a plain folder.
4. Live Slideshow — full-screen 1920x1080 TV/projector display at the venue, no interaction, new strips appear in realtime with a QR in the corner.
5. Admin — desktop web dashboard (1440px) with left sidebar: Event, Template, Device, Transaksi, Tim, Moderasi.

TWO OPERATING MODES (affects Booth and Admin)
- Mode Event: client pays a package outside the system; one fixed layout; printing is free up to a max per session; client gallery enabled.
- Mode Photobox: guest pays per session via QRIS; guest chooses a layout with its own price; extra prints are paid; session timer is mandatory; no client gallery.

DESIGN PRINCIPLES
- Booth screens: readable from 2 meters, very large touch targets, one clear action per screen, no scrolling, minimal text, calm and reassuring error states with no technical jargon for guests.
- Guest page: fastest possible experience on 4G, photo first, save button always reachable, no clutter.
- Client gallery: editorial and emotional, photos are the hero, feels like a keepsake.
- Admin: dense but scannable, tables and status at a glance, clear destructive actions with confirmation.
- One consistent design language across all 5 surfaces, adapted to each device.

LANGUAGE
All UI text in Bahasa Indonesia, casual but polite (use "kamu"). Use realistic Indonesian sample data: event "Andi & Sari — 12 Oktober 2026", venue in Bogor, prices in Rupiah format "Rp 35.000".

FIRST TASK
Generate 3 anchor screens that set the shared visual language:
1. Booth App — Attract screen (1920x1080): event name "Andi & Sari — 12.10.2026", looping sample photo strips, one huge button "Sentuh untuk Mulai".
2. Guest Page (390px): photo strip carousel (Strip / Original / Animasi), fixed bottom button "Simpan ke Galeri HP", link card "Lihat semua foto di acara ini".
3. Admin — Event list (1440px): sidebar navigation, heading "Event" with button "Buat Event", table of events with mode badge and status.
I will send each remaining screen as a separate prompt afterward. Keep every future screen consistent with these three.
```

## A. Booth App

Aplikasi Windows di touchscreen 1920x1080 landscape, dipakai tamu dan crew di lokasi.

### A1 — Attract Screen

```text
Kiosk touchscreen app, landscape 1920x1080. Attract/idle screen for a photobooth at a wedding event.
Full-screen looping sample photo strips in the background area. Event name "Andi & Sari — 12.10.2026" as the main heading. One very large touch target: "Sentuh untuk Mulai". Small discreet corner area (top-right) for a hidden crew access hotspot, visually almost invisible. No navigation bars, no scrolling. Everything must be readable from 2 meters away.
```

### A2 — Pilih Layout (Mode Photobox)

```text
Kiosk touchscreen app, landscape 1920x1080. Screen where a paying customer chooses a photo layout.
Heading "Pilih Layout". 3–4 large selectable cards, each showing a preview thumbnail of the print layout, the layout name, number of photos, and price:
- "Strip Klasik" — 3 foto, 2x6 — Rp 25.000
- "4R Grid" — 4 foto, 4x6 — Rp 35.000
- "4R Single" — 1 foto, 4x6 — Rp 30.000
- "Strip Duo" — 4 foto, 2x6 x2 — Rp 40.000
Selected state on one card. Bottom: "Kembali" (secondary) and "Lanjut ke Pembayaran" (primary). Session timer badge top-right showing "Sisa waktu 04:32".
```

### A3 — Pembayaran QRIS (Menunggu)

```text
Kiosk touchscreen app, landscape 1920x1080. QRIS payment screen.
Left half: large QRIS code with "QRIS" label and merchant name "Tetra Photobooth". Right half: order summary — layout "4R Grid", "Rp 35.000", payment instructions in 3 short numbered steps ("Buka aplikasi e-wallet atau m-banking", "Scan QR", "Bayar, layar akan lanjut otomatis"). Status indicator "Menunggu pembayaran…" with an animated waiting indicator. Countdown "QR berlaku 04:58". Bottom: "Batalkan" button. No manual confirmation button — payment is detected automatically.
```

### A4 — Pembayaran Berhasil / Kedaluwarsa

```text
Kiosk touchscreen app, landscape 1920x1080. Two variants of the QRIS payment result screen, shown as separate frames.
Frame 1 (success): large confirmation icon, "Pembayaran berhasil", "Rp 35.000 · 4R Grid", auto-continue text "Sesi foto dimulai dalam 3…".
Frame 2 (expired): icon, "QR sudah kedaluwarsa", short explanation "Belum ada pembayaran yang masuk", two buttons "Buat QR Baru" (primary) and "Kembali ke Awal" (secondary).
```

### A5 — Countdown + Live View

```text
Kiosk touchscreen app, landscape 1920x1080. Camera capture screen.
Center: large live camera preview area (use a placeholder photo of 3 people posing). Giant countdown number "3" overlaid in the middle. Top: progress "Foto 2 dari 4" with 4 step indicators (1 done, 2 active, 3–4 pending). Small thumbnails of already-taken photos along one side. Session timer badge "Sisa waktu 03:10". Minimal UI, no buttons during countdown. Include a frame variant showing a full-screen flash/capture moment with text "Cekrek!".
```

### A6 — Review & Retake per Foto

```text
Kiosk touchscreen app, landscape 1920x1080. Photo review screen after all shots are taken.
Heading "Cek fotonya dulu". Row of 4 large photo thumbnails. Each photo has an "Ulangi" button beneath it; one photo shows state "Sudah diulang (1/1)" with retake disabled. Helper text "Tiap foto bisa diulang 1 kali". Bottom-right primary button "Pakai Semua Foto". Session timer badge top-right.
```

### A7 — Preview Strip + Pilih Jumlah Cetak

```text
Kiosk touchscreen app, landscape 1920x1080. Final composed print preview and print quantity selection.
Left: large preview of the composed 4x6 print with 4 photos placed in a decorative template overlay (event name and date on the template).
Right: "Mau cetak berapa?" with a large stepper (minus / number / plus), current value "2".
Show two frames:
Frame 1 (Event mode): helper text "Gratis, maksimal 4 lembar", button "Cetak Sekarang".
Frame 2 (Photobox mode): "1 lembar termasuk paket", extra sheets "+1 lembar × Rp 10.000", total "Tambahan Rp 10.000", button "Bayar & Cetak" (leads to QRIS again), plus secondary "Cetak 1 Saja".
```

### A8 — Mencetak + Layar QR

```text
Kiosk touchscreen app, landscape 1920x1080. Final screen after printing is triggered.
Left: printing status "Sedang mencetak…" with progress indicator and "2 lembar · keluar dalam ±15 detik", small preview of the print.
Right (dominant): large QR code with heading "Scan untuk simpan fotomu" and short caption "Foto, versi original, dan animasi ada di sini". Small offline note variant under the QR: "Foto akan tersedia setelah terkirim — QR tetap bisa di-scan sekarang".
Bottom: "Selesai" button and auto-return countdown "Kembali ke awal dalam 20 detik".
```

### A9 — Mode Crew (Dashboard Operator)

```text
Kiosk touchscreen app, landscape 1920x1080. Operator/crew control panel, accessed via PIN (include a small PIN pad frame variant).
Main panel as a status dashboard with cards:
- Kamera: "Canon 700D · Terhubung", battery level, button "Tes Jepret"
- Printer: "DNP RX1HS · Siap", paper counter "Sisa kertas ±142 lembar", media type "4x6"
- Koneksi: "Offline" state, "Antrean upload: 37 sesi"
- Sesi hari ini: "128 sesi · 241 lembar dicetak"
- Event aktif: "Andi & Sari — Mode Event"
Actions: "Ganti Event", "Reset Counter Kertas", "Tes Cetak", "Buka Folder Foto", "Keluar ke Mode Tamu" (primary), "Tutup Aplikasi" (destructive, requires confirmation).
```

### A10 — Error: Kamera Terputus

```text
Kiosk touchscreen app, landscape 1920x1080. Guest-facing error screen when the camera disconnects mid-session.
Calm, non-technical message: "Sebentar ya, kamera sedang disiapkan ulang" with a waiting indicator and "Mencoba menghubungkan kembali… (percobaan 2)". Reassurance text "Foto yang sudah diambil tetap aman". Small bottom-corner text "Butuh bantuan? Panggil crew". No technical error codes on this screen.
```

## B. Halaman Tamu

Mobile web 390px yang dibuka tamu dari QR di booth. Target tampil ≤ 2 detik di 4G.

### B1 — Halaman Sesi Tamu

```text
Mobile web page, 390px wide. Guest photo page opened by scanning a QR at a photobooth.
Top: small event header "Andi & Sari · 12 Oktober 2026".
Main: swipeable carousel with 3 items: the printed strip, original photos, and an animated GIF/boomerang, with dots indicator and labels "Strip", "Original", "Animasi".
Primary full-width button fixed at bottom: "Simpan ke Galeri HP" (triggers native share sheet). Secondary: "Simpan Semua Original".
Below the fold: card "Lihat semua foto di acara ini" linking to the event gallery. Footer: "Foto tersedia sampai 11 Nov 2026" and small "Powered by Tetra Photobooth".
Must load fast on 4G: no heavy decorative elements.
```

### B2 — State "Lagi Dikirim"

```text
Mobile web page, 390px wide. Guest photo page state when the booth hasn't finished uploading yet (booth was offline).
Event header at top. Placeholder area where the strip will appear, with a gentle loading animation. Message "Fotomu lagi dikirim dari booth" and "Halaman ini akan otomatis muncul begitu fotonya sampai, gak perlu refresh". Small tip below: "Simpan link ini, bisa dibuka lagi nanti".
```

### B3 — State Kedaluwarsa

```text
Mobile web page, 390px wide. Expired guest photo page.
Event header. Icon, heading "Foto ini sudah tidak tersedia", body "Foto sesi disimpan selama 30 hari dan sudah dihapus pada 11 Nov 2026". Secondary small section promoting the business: "Mau photobooth di acaramu?" with button "Hubungi Tetra Photobooth".
```

### B4 — Lead Capture (opsional)

```text
Mobile web page, 390px wide. Optional lead capture form shown before the guest sees their photos (enabled per event, e.g., corporate brand activation).
Blurred preview of the photo strip behind. Card with heading "Satu langkah lagi", fields "Nama" and "Nomor WhatsApp" (or "Email"), required consent checkbox with text "Saya setuju data saya digunakan oleh PT Contoh Brand untuk informasi promo, sesuai kebijakan privasi" with link "Kebijakan Privasi". Primary button "Lihat Fotoku". Small text link "Lewati" only if the event allows skipping.
```

## C. Galeri Klien

Galeri seluruh foto event untuk pengantin atau PIC corporate, dibuka lewat link tanpa login. Desain mobile first, dengan frame desktop 1440px.

### C1 — Beranda Galeri

```text
Responsive web page, design mobile first (390px) and also a desktop frame (1440px). Private event gallery for a wedding couple, opened via link without login.
Full-bleed hero cover photo with couple name "Andi & Sari", date "12 Oktober 2026", venue "Gedung Kirana, Bogor", and stats "1.284 foto".
Sticky toolbar: "Putar Slideshow", "Download Semua", "Pilih", "Favorit (12)".
Retention notice: "Galeri tersedia 72 hari lagi" with a subtle progress indicator.
Photos grouped by time of event with section headers like "18.00 – Akad", "19.00 – Resepsi", "20.00 – Photobooth", each section a masonry grid of photos. Time jump chips at top for quick navigation between hours.
```

### C2 — Lightbox

```text
Responsive web, mobile (390px) and desktop (1440px) frames. Full-screen photo lightbox inside the event gallery.
Large photo, previous/next navigation (swipe on mobile), counter "214 / 1.284", time taken "19.42". Actions: "Favorit" (toggle heart), "Download", "Bagikan", "Tutup". On desktop, a thin filmstrip of adjacent thumbnails at the bottom.
```

### C3 — Mode Pilih → ZIP

```text
Responsive web, mobile (390px) frame primarily. Selection mode inside the event gallery.
Grid of photos with checkboxes, 23 selected. Top bar replaced by "23 dipilih" with "Batal" and "Pilih Semua di Bagian Ini". Bottom sticky action bar: "Download ZIP (23 foto · ±86 MB)" primary, "Tambah ke Favorit" secondary. Include a second frame showing ZIP preparation: "Menyiapkan file ZIP… 60%" with note "Jangan tutup halaman ini".
```

### C4 — Pengaturan Klien (Galeri Publik)

```text
Mobile web bottom sheet / modal (390px) inside the client gallery. Sharing settings for the couple.
Toggle "Galeri publik" with explanation "Kalau aktif, tamu bisa lihat semua foto acara dari halaman foto mereka". Section "Bagikan galeri" with copy-link field and button "Salin Link". Info "Link ini hanya untuk kamu dan keluarga. Jangan dibagikan ke publik kalau galeri privat." Retention info "Semua foto akan dihapus pada 10 Jan 2027".
```

### C5 — Temukan Foto Saya (Fase 5)

```text
Mobile web page (390px). "Find my photos" feature inside a public event gallery.
Step 1 frame: heading "Temukan Foto Saya", explanation "Ambil selfie, kami carikan foto-foto yang ada wajahmu", consent checkbox "Saya setuju wajah saya diproses hanya untuk pencarian ini dan tidak disimpan", button "Ambil Selfie".
Step 2 frame: results "Ketemu 18 foto kamu" with grid of matched photos and button "Download Semua (18)".
```

## D. Live Slideshow

Tayangan realtime di TV atau proyektor venue, tanpa interaksi.

### D1 — Live Slideshow

```text
Full-screen TV display, landscape 1920x1080, no interaction. Realtime slideshow at the event venue.
Main area shows the newest photo strip large, with a subtle "Baru!" label when a strip just arrived. Side column shows the 4 most recent strips as a queue. Bottom-right corner: QR code with caption "Scan untuk lihat semua foto". Top-left: event name "Andi & Sari". Designed to be readable from across a ballroom; no controls visible.
```

## E. Admin

Dashboard web desktop 1440px untuk Owner, Admin, dan Crew (akses terbatas). Semua layar memakai sidebar yang sama.

### E1 — Daftar Event

```text
Desktop web admin dashboard, 1440px. Event list page for a photobooth business.
Left sidebar navigation: "Event", "Template", "Device", "Transaksi", "Tim", "Moderasi". Page heading "Event" with primary button "Buat Event".
Filter tabs: "Semua", "Mendatang", "Berlangsung", "Selesai". Filter by mode: "Event" / "Photobox".
Table/list with columns: event name, date, mode badge, assigned device, sessions count, status ("Berlangsung", "Mendatang", "Selesai", "Arsip"), retention remaining. Sample rows: "Andi & Sari Wedding", "Gathering PT Nusantara", "Photobox Mall Botani Square", "Wisuda IPB".
```

### E2 — Dashboard Event

```text
Desktop web admin, 1440px. Single event dashboard for "Andi & Sari Wedding".
Header with event name, date, mode badge, status, and buttons "Buka Galeri Klien", "Buka Slideshow", "Pengaturan".
Stat cards: "Total sesi 412", "Lembar dicetak 698", "QR dibuka 287 (70%)", "Rata-rata foto → print 14 dtk".
Chart: sessions per hour through the event. Share analytics section: QR opens, downloads, saves-to-phone, gallery link visits, with a funnel "Sesi → QR dibuka → Disimpan".
Recent sessions list with thumbnails and upload status ("Terkirim", "Menunggu upload").
```

### E3 — Pengaturan Event

```text
Desktop web admin, 1440px. Event settings form, organized in sections with a right-side sticky save bar.
Sections:
- Informasi: nama event, tanggal, venue, nama klien, jenis event.
- Mode: radio "Mode Event" / "Mode Photobox".
- Sesi: layout (event mode: single select; photobox mode: multi-select layouts each with price input), jumlah foto per sesi, timer sesi (toggle + seconds), maksimal cetak per sesi, harga lembar tambahan (photobox only), jumlah retake per foto.
- Halaman tamu: toggle lead capture, custom consent text, toggle animasi.
- Galeri klien: toggle galeri publik, retensi (tamu 30 hari, klien 90 hari), link klien with "Salin" and "Cabut & Buat Ulang Link" (destructive, confirmation).
- Device: assign booth device.
```

### E4 — Editor Template

```text
Desktop web admin, 1440px. Template editor based on a PNG overlay with photo slots (not a free-form design editor).
Left panel: template list and "Upload Overlay PNG". Format selector "4x6" / "2x6 strip", orientation.
Center canvas: the overlay PNG shown on top of numbered photo slot rectangles (Slot 1–4), with drag handles to move/resize slots, and a toggle "Tampilkan sample foto".
Right panel: selected slot properties (X, Y, width, height, rotation, layer order above/below overlay), list of slots with add/remove, and dynamic text fields (nama event, tanggal) with position.
Top bar: template name, "Preview Cetak", "Simpan".
```

### E5 — Device

```text
Desktop web admin, 1440px. Booth device management page.
Heading "Device" with button "Daftarkan Device" (shows pairing code). List of booth devices as cards or rows: device name "Booth 01 – Laptop Asus", status (Online / Offline since 14.20), app version, assigned event, camera model and status, printer and paper remaining, upload queue count, last heartbeat. Actions per device: "Lihat Detail", "Ganti Event", "Nonaktifkan". Warning state example: "Kertas tinggal 18 lembar".
```

### E6 — Transaksi Photobox

```text
Desktop web admin, 1440px. QRIS transaction list for photobox mode.
Summary cards: "Pendapatan hari ini Rp 1.240.000", "Transaksi 38", "Sukses 97%", "Kedaluwarsa / gagal 3".
Filters: date range, event/location, device, status ("Berhasil", "Menunggu", "Kedaluwarsa", "Gagal").
Table: waktu, ID transaksi, event/lokasi, device, layout, item (paket / lembar tambahan), nominal, status, link to session. Button "Export CSV".
```

### E7 — Tim & Role

```text
Desktop web admin, 1440px. Team and roles management.
Heading "Tim" with button "Undang Anggota". Table: name, email, role ("Owner", "Admin", "Crew"), last active, actions. Side panel or section explaining role permissions as a matrix: rows = features (Event, Template, Device, Transaksi, Tim & Billing, Moderasi, Export Lead), columns = Owner / Admin / Crew, cells = full / view / none.
Invite modal frame: email field, role select, button "Kirim Undangan".
```

### E8 — Moderasi + Audit Log

```text
Desktop web admin, 1440px. Content moderation for an event gallery.
Top: event selector. Grid of session photos with hover actions "Sembunyikan" and "Hapus", hidden photos shown with a "Disembunyikan" label and "Tampilkan lagi" action. Bulk selection bar.
Delete confirmation modal: "Hapus permanen 3 foto? Tindakan ini tidak bisa dibatalkan", reason field (required).
Second tab "Audit Log": table with time, user, action (hid photo, deleted photo, regenerated client link, exported leads), target, reason.
```
