# 03 — TSD: Spesifikasi Teknis

## 0. Abstraksi platform

UI booth (layar, state machine sesi, template engine) ada di `packages/booth-core` dan **tidak boleh** mengimpor Electron, Node, atau Capacitor. Semua akses perangkat lewat satu interface:

```ts
interface BoothPlatform {
  camera: { list(); connect(id); startLiveView(onFrame); stopLiveView(); capture(req): Promise<CaptureResult>; onStatus(cb) };
  printer: { submit(job): Promise<void>; status(jobId); onStatus(cb) };   // lokal atau via Air Station
  storage: { writeFile(path, bytes); readFile(path); sessionDir(id) };
  db: { /* repositori sesi, aset, antrean, print job */ };
  sync: { enqueue(assetId); status(); onChange(cb) };
  device: { info(); keepAwake(on); kiosk(on) };
}
```

| Adapter | Platform | Kapan dibangun |
|---|---|---|
| `platform-electron` | Windows (lalu macOS) | Fase 0–1 |
| `platform-capacitor` | Android & iPad | Fase 7 |

Di Fase 0–5 hanya adapter Electron yang dibangun. Interface-nya tetap dipakai sejak awal supaya platform lain nanti tinggal menambah adapter, bukan menulis ulang UI.

## 1. Model proses di booth

| Proses | Tanggung jawab |
|---|---|
| **Electron main** | SQLite lokal, sync worker (pull event, push upload), supervisor Camera Service, heartbeat, penyimpanan token (`safeStorage`), auto-update (hanya dari mode crew) |
| **Electron renderer** | UI React (state machine sesi), template engine (render strip via `OffscreenCanvas`), tampilan live view |
| **Tetra Camera Service** (C# .NET 10, console app tanpa jendela) | Canon EDSDK, Sony CRSDK (Fase 5), fallback hot-folder, print ke DNP |

Komunikasi:
- Renderer ↔ main: IPC bertipe via `contextBridge` (tanpa `nodeIntegration`).
- Main & renderer ↔ Camera Service: WebSocket `ws://127.0.0.1:{port}`. Port & token acak dibuat main saat spawn, diberikan lewat argumen & env. Koneksi tanpa token ditolak.
- Main me-restart Camera Service jika proses mati atau health check gagal 3x berturut-turut (interval 5 detik).

State machine sesi di renderer ditulis eksplisit (XState atau reducer bertipe), bukan kumpulan `useState`. Setiap transisi dicatat ke log lokal.

## 2. Protokol Camera Service

Pesan JSON teks: `{ "id": "uuid", "type": "...", "payload": {...} }`. Balasan memakai `id` yang sama. Event tanpa `id`.

**Perintah**

| type | payload | balasan |
|---|---|---|
| `camera.list` | – | `[{ id, brand, model, serial }]` |
| `camera.connect` | `{ id }` | `{ ok }` |
| `camera.status` | – | `{ connected, model, battery, shotsRemaining }` |
| `liveview.start` / `liveview.stop` | – | `{ ok }` |
| `capture` | `{ sessionId, index, outputDir }` | `{ path, width, height }` (setelah file tersimpan) |
| `print.submit` | `{ jobId, path, copies, paper: "4R" \| "2x6x2" }` | `{ accepted }` |
| `print.status` | `{ jobId }` | `{ status, error? }` |
| `system.health` | – | `{ uptime, camera, printer }` |

**Event:** `camera.connected`, `camera.disconnected`, `capture.failed`, `print.done`, `print.failed`, `printer.status`.

**Live view:** frame biner di WebSocket yang sama. Format: byte 0 = `0x01`, sisanya JPEG. Renderer menggambar ke `<canvas>` (mirror via transform). Target ≥ 20 fps.

### 2.1 Canon (EDSDK)
- Pakai wrapper C# untuk EDSDK (pelajari pola dari source digiCamControl). Semua panggilan EDSDK dijalankan di satu thread khusus dengan antrean perintah (EDSDK tidak thread-safe).
- Simpan hasil ke host (`SaveTo_Host`), unduh langsung ke `outputDir`.
- Saat connect: matikan auto power off kamera, set kualitas JPEG Large Fine.
- Disconnect → loop reconnect tiap 2 detik, emit `camera.disconnected` / `camera.connected`.
- File DLL EDSDK tidak di-commit ke git (lisensi Canon); disimpan di lokasi build privat.

### 2.2 Sony (Fase 5)
- Sony Camera Remote SDK. Cek daftar model yang didukung di dokumentasi SDK versi terbaru sebelum mulai; a7III perlu mode "PC Remote".

### 2.3 Fallback hot-folder
- `FileSystemWatcher` di folder yang dikonfigurasi. File JPEG baru → dianggap hasil `capture` berikutnya. Dipakai jika SDK bermasalah (mis. EOS Utility yang menulis ke folder).

### 2.4 Print (DNP RX1HS)
Print di balik interface `IPrinterAdapter`. Fase 1–5: `WindowsPrinterAdapter`. Fase 6: `CupsPrinterAdapter` (macOS). Kode di luar `TetraCamera.Print.Windows` tidak boleh memakai API khusus Windows, supaya Camera Service bisa jalan di macOS.

**WindowsPrinterAdapter:**
- `System.Drawing.Printing`: pilih printer DNP, pilih `PaperSize` dari driver sesuai preset (`4R` → ukuran 4×6; `2x6x2` → ukuran 4×6 dengan opsi cut 2 inch dari driver). Nama paper size persis diambil dari driver saat setup dan disimpan di config device.
- Gambar sudah dalam ukuran piksel pas (1200×1800 @300dpi), digambar tanpa scaling tambahan; borderless diatur driver.
- Status printer dibaca dari spooler Windows; job error → `print.failed` dengan kode.

## 3. Penyimpanan lokal booth

```
%APPDATA%/TetraBooth/
  db.sqlite
  logs/                      # rotasi harian, simpan 14 hari
  events/{eventId}/bundle/   # config.json + aset (overlay, font, attract)
  sessions/{sessionId}/
    raw/1.jpg ...            # full-res dari kamera (tidak di-upload)
    out/strip.jpg            # resolusi cetak
    out/strip_web.jpg
    out/original_1.jpg ...   # 2400px
    out/thumb_*.jpg          # 480px
```

Skema SQLite: lihat `06-DATA-MODEL.md §3`.

## 4. Sync

### 4.1 Pull (cloud → booth)
- `GET /api/booth/events` → event yang ditugaskan ke device, dengan `bundleVersion`.
- Jika `bundleVersion` berubah: `GET /api/booth/events/{id}/bundle` → manifest (config + daftar aset + hash + URL). Unduh aset yang hash-nya berbeda. Tulis ke folder sementara, lalu swap atomik.
- Event aktif tidak diganti di tengah sesi; bundle baru dipakai mulai sesi berikutnya.

### 4.2 Push (booth → cloud)
1. Sesi selesai → tulis `sessions`, `assets`, dan baris `upload_queue` per aset dalam satu transaksi SQLite.
2. Worker (konkurensi 2): prioritas `strip_web` & thumb strip → original → sisanya.
3. `POST /api/booth/sessions` (upsert metadata sesi, idempotent berdasarkan ID).
4. `POST /api/booth/uploads/sign` (batch) → URL PUT presigned R2 (berlaku 15 menit).
5. PUT file ke R2.
6. `POST /api/booth/sessions/{id}/assets` untuk mencatat aset yang sudah masuk. Jika semua lengkap → `upload_status = complete`.
- Retry backoff: 5 dtk, 15 dtk, 1 mnt, 5 mnt (maks). Error disimpan di `last_error`.
- Worker berhenti saat offline (cek koneksi tiap 15 detik) dan tidak pernah memblokir UI.

## 5. ID & token

| Item | Format |
|---|---|
| Session ID | nanoid 10 karakter, alfabet tanpa karakter mirip: `23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ` |
| Client token, live token | nanoid 32 karakter |
| Device token | 40 byte acak (base64url). Disimpan di DB sebagai SHA-256. |
| Kode pairing | 6 digit angka, berlaku 10 menit, sekali pakai |

## 6. Template engine (`packages/template-engine`)

Fungsi murni: `render(spec, inputs, ctx) → canvas`. Dipakai di booth (OffscreenCanvas di renderer) dan admin (canvas browser). Tidak boleh ada kode render kedua.

```ts
type LayoutSpec = {
  id: string; version: number;
  paper: "4R" | "2x6x2";
  canvas: { width: number; height: number; dpi: 300 }; // 4R: 1200x1800, 2x6x2: 600x1800 (satu strip)
  background?: { color?: string; assetId?: string };
  slots: { id: string; x: number; y: number; w: number; h: number; rotation?: number;
           fit: "cover"; z: "below_overlay" | "above_overlay" }[];
  overlay?: { assetId: string };
  texts: { x: number; y: number; w: number; fontAssetId: string; size: number;
           color: string; align: "left" | "center" | "right"; value: string }[]; // value boleh "{event_name}", "{date}"
};
```
- Urutan gambar: background → slot `below_overlay` → overlay → slot `above_overlay` → teks.
- `2x6x2`: render satu strip 600×1800, lalu gambar dua kali berdampingan di kanvas 1200×1800.
- Validasi spec dengan zod di kedua sisi.
- Test snapshot: render spec contoh → bandingkan hash piksel.

## 7. API

Semua di Next.js Route Handlers, input divalidasi zod.

**Booth** — header `Authorization: Bearer {deviceToken}`

| Method | Path | Fungsi |
|---|---|---|
| POST | `/api/booth/pair` | Tukar kode pairing → device token |
| GET | `/api/booth/events` | Event yang ditugaskan |
| GET | `/api/booth/events/{id}/bundle` | Manifest bundle |
| POST | `/api/booth/sessions` | Upsert sesi |
| POST | `/api/booth/uploads/sign` | URL presigned (batch) |
| POST | `/api/booth/sessions/{id}/assets` | Catat aset terupload |
| POST | `/api/booth/heartbeat` | Status booth |
| POST | `/api/booth/payments` | Buat tagihan QRIS |
| GET | `/api/booth/payments/{id}` | Status tagihan |

**Publik** (rate-limited per IP)

| Method | Path | Fungsi |
|---|---|---|
| GET | `/api/s/{sessionId}` | Data halaman tamu |
| POST | `/api/s/{sessionId}/lead` | Kirim lead |
| POST | `/api/track` | Analytics event |
| GET | `/api/g/{token}` | Data galeri klien (paginated) |
| POST | `/api/g/{token}/favorites` | Toggle favorit |
| POST | `/api/g/{token}/public-gallery` | Toggle galeri publik |
| POST | `/api/g/{token}/zip` | Buat URL ZIP bertanda tangan |

**Webhook:** `POST /api/webhooks/xendit` — verifikasi header `x-callback-token`, idempotent berdasarkan ID pembayaran.

**Admin:** Server Actions dengan klien Supabase milik user (RLS berlaku). Operasi ke R2 & Xendit hanya di server.

## 8. Pembayaran QRIS

```
booth → POST /api/booth/payments {eventId, layoutId, prints}
server: hitung harga dari DB (bukan dari booth) → buat QRIS dinamis Xendit (expiry 5 mnt)
      → simpan payments(status=pending) → balas {paymentId, qrString, amount, expiresAt}
booth: render QR dari qrString, poll GET /payments/{id} tiap 2 dtk
Xendit → webhook → payments.status=paid
server (saat poll & status masih pending > 20 dtk): cek langsung ke API Xendit sebagai cadangan webhook
booth: status=paid → mulai sesi, session.payment_id = paymentId
```
- Harga selalu dihitung server. Booth tidak pernah mengirim nominal.
- Adapter `PaymentProvider` (interface) supaya provider lain / voucher bisa ditambah tanpa bongkar.

## 9. Storage & retensi

- Bucket R2 privat untuk tulis; baca publik lewat custom domain `media.{domain}` + cache Cloudflare.
- Key tidak bisa ditebak karena memuat session ID. Masa berlaku link tamu ditegakkan di halaman; file fisik dihapus saat `client_expires_at` (atau `guest_expires_at` untuk photobox).
- Cron harian 02.00 WIB (Vercel Cron `0 19 * * *` UTC): event dengan `purge_at < now()` dan `purged_at is null` → hapus semua objek di prefix event (list + batch delete) → isi `purged_at`.
- Lifecycle rule bucket: hapus objek umur > 400 hari (pengaman jika cron gagal).
- Sesi dihapus admin → objek dihapus langsung, bukan menunggu cron.

## 10. ZIP

- Cloudflare Worker `zip.{domain}` menerima URL bertanda tangan (HMAC, berlaku 1 jam) berisi daftar key, lalu streaming ZIP langsung dari R2 (mode store, tanpa kompresi — JPEG sudah terkompresi). Tidak ada file ZIP yang disimpan.

## 11. Realtime

- Live slideshow & dashboard admin memakai Supabase Realtime (perubahan `sessions` di mana `upload_status = complete`).
- Booth **tidak** memakai realtime (polling lebih tahan sinyal buruk).

## 12. Heartbeat & monitoring

- Booth kirim heartbeat tiap 60 detik saat online: versi app, event aktif, kamera, printer, sisa kertas, jumlah antrean, error terakhir.
- Online = `last_seen_at` < 2 menit.
- Sentry di web & Electron (main + renderer). Camera Service menulis log file; log dikirim hanya saat crew menekan "Kirim log".

## 13. Keamanan

- RLS di semua tabel berbasis `organization_id` (lihat data model).
- Service role Supabase hanya di server, tidak pernah di booth atau browser.
- Halaman tamu, klien, live: `noindex, nofollow`.
- Rate limit endpoint publik.
- Consent lead & wajah disimpan dengan timestamp & teks versi persetujuan.

## 14. Performa

| Target | Nilai |
|---|---|
| Live view | ≥ 20 fps |
| Capture → foto tampil | ≤ 2 detik |
| Compose strip | ≤ 1,5 detik |
| Foto terakhir → print keluar | ≤ 20 detik |
| Halaman tamu (4G) | LCP ≤ 2 detik |

## 15. Temukan Foto Saya (Fase 5)

- Embedding wajah dibuat **di booth** setelah sesi (model ONNX di Camera Service), dikirim bersama metadata sesi. Foto tidak diproses ulang di server.
- Disimpan di Postgres `pgvector` per event.
- Selfie tamu: embedding dihitung di server function, dicari cosine similarity di event itu saja, selfie tidak disimpan.
- Wajib consent eksplisit sebelum upload selfie. Embedding dihapus bersama event.

## 16. Air Station (Fase 7)

- Air Station = mode dari app desktop (Windows/macOS) yang hanya menjalankan print + server LAN, tanpa UI tamu.
- Booth (Android/iPad) menemukan station lewat mDNS (`_tetrastation._tcp`) di jaringan lokal, lalu pairing sekali dengan kode 6 digit yang tampil di layar station.
- Kirim job: `POST http://{station}/jobs` (strip JPEG resolusi cetak + jumlah + paper), token pairing di header. Status via WebSocket.
- Tidak butuh internet; cukup router Wi-Fi lokal. Satu station bisa melayani beberapa booth, antrean FIFO.
- Upload ke cloud tetap dilakukan oleh booth masing-masing.
