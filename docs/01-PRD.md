# 01 — PRD: Tetra Booth

## 1. Ringkasan

Tetra Booth adalah platform photobooth milik Tetra Photobooth yang menggantikan LumaBooth (dslrBooth). Terdiri dari:

- **Booth App** — aplikasi Windows yang mengontrol kamera, menyusun strip, mencetak, dan menampilkan QR.
- **Cloud** — sync sesi & foto, penyimpanan, pembayaran QRIS.
- **Halaman Tamu** — foto sesi tamu via QR.
- **Galeri Klien** — seluruh foto event untuk pengantin/PIC corporate.
- **Live Slideshow** — tayangan realtime di TV/proyektor venue.
- **Admin** — kelola event, template, device, tim, transaksi.

## 2. Masalah

1. Biaya langganan LumaBooth terus berjalan, sementara kontrol atas desain dan pengalaman terbatas.
2. Galeri yang dibagikan ke klien di LumaBooth berupa grid dashboard, bukan pengalaman yang layak dijual.
3. Share via Email/SMS/WhatsApp hampir tidak dipakai (data event nyata: 543 upload, 0 share). Tamu mengandalkan QR.
4. Belum ada software sendiri untuk bisnis photobox bayar-per-sesi.

## 3. Tujuan

| ID | Tujuan |
|---|---|
| G1 | Booth stabil setara LumaBooth: tidak crash sepanjang event, jalan 100% offline. |
| G2 | Pengalaman tamu tercepat: QR langsung muncul, foto masuk galeri HP dalam 1 tap. |
| G3 | Galeri klien yang jadi nilai jual Tetra, bukan sekadar folder. |
| G4 | Mode photobox dengan pembayaran QRIS otomatis. |
| G5 | Arsitektur siap multi-tenant untuk dijual sebagai SaaS. |

## 4. Bukan tujuan (untuk sekarang)

- Editor template ala Canva (pakai overlay PNG + slot).
- Background removal, AI portraits, filter AI.
- Pengiriman via Email/SMS/WhatsApp.
- Kamera Nikon.
- Booth macOS, Android, iPad, dan Air Station belum di rilis awal, tapi **arsitekturnya disiapkan sejak Fase 0** (lihat §11).
- Pembayaran tunai/voucher.
- Integrasi Tetra Ops (fase setelah roadmap ini).

## 5. Aktor

| Aktor | Siapa | Kebutuhan utama | Akses |
|---|---|---|---|
| Tamu | Pengunjung event / pelanggan photobox | Foto cepat, cetak, simpan ke HP | Booth + link QR |
| Klien | Pengantin / PIC corporate | Semua foto event, download, bagikan | Link galeri (tanpa login) |
| Crew | Operator di lokasi | Booth siap jalan, pantau kamera, printer, kertas | Mode crew di booth + admin (terbatas) |
| Admin | Tim Tetra | Setup event, template, device, laporan | Admin penuh kecuali tim & billing |
| Owner | Rama & co-owner | Semua | Admin penuh |

## 6. Mode operasi

| | Mode Event | Mode Photobox |
|---|---|---|
| Contoh | Wedding, corporate, gathering | Mall, cafe, pop-up di event |
| Pembayar | Klien (per paket, di luar sistem) | Tamu per sesi via QRIS |
| Layout | 1, fix per event | Tamu memilih; tiap layout punya harga |
| Jumlah cetak | Tamu pilih, maks X, gratis | Tamu pilih; lembar tambahan berbayar |
| Timer sesi | Opsional | Wajib |
| Galeri klien | Ya | Tidak |
| Retensi | Tamu 30 hari, klien 90 hari | 30 hari |

## 7. Fitur utama

**Booth:** attract screen, pilih layout (photobox), bayar QRIS (photobox), countdown + live view, capture, review & retake per foto, compose strip, pilih jumlah cetak, print DNP, layar QR, mode crew, kerja offline, antrean upload.

**Halaman tamu:** strip + original + animasi, simpan 1 tap (share sheet), status "lagi dikirim", status kedaluwarsa, lead capture opsional, link galeri event (jika publik).

**Galeri klien:** cover hero, foto per jam acara, lightbox, favorit, pilih → ZIP, download semua, slideshow, toggle galeri publik, hitung mundur retensi, "Temukan Foto Saya" (Fase 5).

**Live slideshow:** strip baru muncul realtime, QR di pojok layar.

**Admin:** daftar event, dashboard event (statistik + share analytics), pengaturan event, editor template, device, transaksi photobox, tim & role, moderasi (sembunyikan/hapus + audit log).

## 8. Metrik sukses

| Metrik | Target |
|---|---|
| Crash per event | 0 |
| Stress test | 500 sesi otomatis tanpa crash / kamera putus |
| Foto terakhir → print keluar | ≤ 20 detik |
| Sesi ter-upload ≤ 5 menit setelah selesai (saat online) | ≥ 95% |
| QR open rate (sesi dibuka / total sesi) | ≥ 60% |
| Transaksi QRIS sukses tanpa bantuan crew | ≥ 98% |
| Halaman tamu tampil (4G) | ≤ 2 detik |

## 9. Asumsi & batasan

- Kamera: Canon 600D, 700D, 60D, 70D (EDSDK). Sony a7III di Fase 5.
- Printer: DNP RX1HS (4R 4×6, strip 2×6 via cut).
- Layar: touchscreen 1920×1080, landscape atau portrait.
- OS booth: Windows 10/11 64-bit.
- Internet di venue tidak dijamin. Photobox membawa modem 4G sendiri.

## 10. Risiko

| Risiko | Mitigasi |
|---|---|
| Kamera putus koneksi USB di tengah event | Auto-reconnect di Camera Service, watchdog, stress test semalaman |
| Sony SDK lebih rewel dari EDSDK | Ditunda ke Fase 5; fallback hot-folder |
| QRIS tidak jalan tanpa internet | Modem 4G wajib di kit photobox |
| Verifikasi merchant Xendit lama | Daftar sejak Fase 0, development pakai sandbox |
| Data pribadi tamu (lead, wajah) | Consent eksplisit sesuai UU PDP, export lead hanya dari admin |
| Link klien bocor | Token bisa dicabut & dibuat ulang dari admin |

## 11. Visi platform

| Platform | Kamera | Cetak | Fase |
|---|---|---|---|
| Windows (Electron) | DSLR/mirrorless via USB | Langsung ke DNP | 1 |
| macOS (Electron) | DSLR/mirrorless via USB | Langsung ke DNP (CUPS) | 6 |
| Android & iPad (Capacitor) | Kamera bawaan perangkat | Lewat Air Station | 7 |
| Air Station (Windows/macOS) | – | Terima job via Wi-Fi lokal → DNP | 7 |

Air Station memungkinkan setup ringan: tablet di depan tamu, laptop + printer di belakang meja, terhubung lewat router lokal tanpa internet.
