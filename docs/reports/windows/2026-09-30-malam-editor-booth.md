# 30 Sep 2026 malam: capture 60D, kiosk, pemilih desain, editor desain booth

Laptop booth Rama (Windows 11). Booth terpasang: 0.5.33 → 0.5.34 (manual dari artefak CI) → 0.5.35 → 0.5.36 → 0.5.37 (mode crew). Jatah cetak malam ini 15, terpakai 1 (tes cetak 4R, sebelumnya).

## Selesai

| Commit | Isi | Uji |
|---|---|---|
| `33d3d7f` | 60D menjawab DEVICE_BUSY (0x81) pada SaveTo host; `Open()` mencoba ulang 10×200 ms dan menutup sesi kalau gagal. Tes Jepret: live view `contain` (tidak terpotong) + toggle "Garis bantu" (sepertiga, margin aman 5%, kotak slot). | 60D: sesudah kamera dimatikan-nyalakan, jepret OK 2,3 s. |
| `8312174`, `04b9308` | Picker event menjelaskan event yang tidak muncul. Judul layar awal mengecil sampai setiap kata muat utuh (maks. 3 baris). QR editor min. 90 px. | "Captain barbershop": 126 px, 2 baris. |
| `dd447e3` | Kiosk selalu di atas (`setAlwaysOnTop(on, "screen-saver")` bersama `setKiosk`), dilepas untuk dialog printer/admin. | 0.5.37 terpasang: jendela `WS_EX_TOPMOST=True`. |
| `8ef897a` | Pemilih desain/layout tamu dirombak: kartu di tengah, pratinjau besar, pilihan jelas, tombol menyebut desain. | e2e designs + photobox. |
| `b36923f` | rls.test: initdb UTF8 (migrasi berisi "→" gagal di WIN1252). | unit db 8/8. |
| `012b85d` | Editor desain `@tetra/editor` di booth (#131): Event & Desain → Edit desain → simpan = override lokal per event, "Kembalikan ke cloud". | Dev dengan event nyata DESSY DAN BONAR (geser slot, simpan, pratinjau tamu berubah, dikembalikan ke cloud). e2e: unggah overlay → sesi memakai overlay lokal. |

Gate setiap push: biome 0, typecheck, unit, e2e 11/11, dotnet 100/100.

## Temuan

- **Terminal VS Code** membawa `ELECTRON_RUN_AS_NODE=1`: booth yang diluncurkan dari sana langsung keluar ("bad option"). Luncurkan dengan `env -u ELECTRON_RUN_AS_NODE`.
- **Update 0.5.37** terpasang sendiri lewat unduhan latar belakang sebelum skrip crew sempat menekan "Pasang".
- **Tes flaky:** bumper.spec (video `currentTime` tetap 0 selama 15 s, sekali) dan crew.test PIN (hex acak memuat "1234"; diperbaiki).

## Belum / butuh Rama

- W-036 QR di cetakan (2 lembar) dan uji 2 desain (2 lembar): kamera + printer dimatikan malam ini.
- Editor booth: uji layar sentuh nyata dan jalur offline (cabut internet → edit → sesi → cetak).
- Usul ke Mac: `onBack(dirty)` / `onDirtyChange` di editor; font pustaka satu sumber (sekarang disalin ke `apps/booth/src/renderer/public/fonts`).
