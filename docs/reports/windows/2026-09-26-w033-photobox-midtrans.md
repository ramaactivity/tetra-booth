# W-033 — photobox end-to-end, Midtrans sandbox — 2026-09-26 (WIB 20.37–20.45)

Booth dev (`win@a9755ab` + main, setara 0.5.10), data B02 asli (`%APPDATA%\TetraBooth`), `--camera=webcam` (HP HD Camera), Print to PDF (`--print-to-file`), tanpa DNP.

Admin (jendela Electron yang dikendalikan Windows; Rama login sendiri):
- Event **Uji Photobox Midtrans** (`24e8190d…`), Mode Photobox.
- Paket Strip Klasik + 4R Single @ Rp10.000, cetak tambahan Rp5.000.
- Ditugaskan ke Booth Rama.

| Langkah | Hasil |
| --- | --- |
| Sync → pilih event (mode crew → Ganti Event → Mode Photobox) | ✔ |
| Sesi 1: layout Strip Klasik → Lanjut ke Pembayaran → **QRIS tampil 0,90 s**, total **Rp 10.000** | ✔ |
| Admin → Transaksi → Simulasikan bayar TRX-1CFAB5 (13:38:16Z) → booth "Pembayaran berhasil" **13:38:17Z (±1 s, tanpa refresh)** | ✔ |
| Foto 3× (webcam, timer "Sisa waktu") → review → Cetak 1 Saja → `[print] selesai` → QR tamu "Sudah tercetak 1 lembar" | ✔ (foto hitam, lihat catatan) |
| Sesi 2: QRIS 0,89 s Rp 10.000 → bayar TRX-F2FF79 → paid 13:39:04Z | ✔ |
| Pilih cetak: + → "Tambahan Rp 5.000" → Bayar & Cetak → QRIS kedua (+1 lembar × Rp 5.000) → bayar TRX-4582E7 13:39:43Z → printing 13:39:46Z → "Sudah tercetak **2 lembar**" | ✔ |
| Sesi 3: QRIS 0,91 s, dibiarkan → **13:45:09Z "Waktu pembayaran habis. QR sudah tidak berlaku. Buat QR baru untuk lanjut."** [Batalkan] [Buat ulang]; admin: TRX-D8E7E9 **Kedaluwarsa** | ✔ |

Timeline log booth (UTC): `layout_select 13:37:53.9 → payment 13:37:54.3 → paid 13:38:17.2 → countdown 13:38:20 → review 13:38:35.7 → print_select 13:38:37.1 → printing 13:38:37.9 → [print] selesai 13:38:39.9`. Sesi 2: `payment 13:38:43.5 → paid 13:39:04.3 → … print_select 13:39:25.1 → payment (tambahan) 13:39:26.8 → printing 13:39:46.1`.

Catatan:
- **Foto webcam hitam** (3 sesi). Izin kamera Windows = Allow, perangkat OK → kemungkinan penutup privasi kamera laptop / ruangan gelap. Tidak memengaruhi alur pembayaran. Minta Rama cek shutter kamera.
- Screenshot QRIS tambahan 0,8 s setelah klik masih "Membuat QR…" dengan Total "…". Wajar, tagihan benar Rp 5.000.
- Efek samping: cetak ke PDF memakai data B02 asli, jadi penghitung kertas turun 3 (619 → 616) tanpa kertas nyata terpakai.
- Log booth hanya mencatat fase (`[phase] payment/paid`). Untuk diagnosa pembayaran di lapangan, sebaiknya catat juga id transaksi, nominal, dan hasil polling (mis. `[payment] TRX-… pending/paid/expired`).
