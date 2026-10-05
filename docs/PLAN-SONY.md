# Rencana Sony: Camera Remote Command (PTP) di Camera Service

Status: **rencana, belum ada kode** (5 Okt 2026). Bahan Sony (Camera Remote Command 2.02.00 + Camera Remote SDK 2.02.00) sudah diunduh ke `services/camera/TetraCamera.Sony/sdk/` (tidak di-commit, lihat README di sana). Roadmap: Fase 5, baris "Sony via Camera Remote Command". Dokumen ini hanya memuat kesimpulan dan identifier (opcode/kode properti); teks dan kode Sony tidak disalin.

Target selesai: A7 III dan A7 IV dipakai di event nyata lewat booth (live view, jepret, unduh JPEG penuh ke laptop, setelan crew, sambung ulang) setara Canon EDSDK (DECISIONS #111).

## 1. Command set per bodi

Sony punya dua versi protokol PTP vendor yang **opcode dan alurnya sama**; bedanya versi yang dikirim saat handshake dan sebagian properti/kontrol.

| Bodi owner | Model | PTP 3 | PTP 2 | Dipakai |
|---|---|---|---|---|
| A7 II | ILCE-7M2 | – | ✓ | **v2** |
| A7 III | ILCE-7M3 | – | ✓ | **v2** |
| A7 IV | ILCE-7M4 | ✓ | ✓ (deprecated, bisa dihentikan 2027) | **v3** |
| A7 V | ILCE-7M5 | ✓ | – | **v3** |
| A7C | ILCE-7C | ✓ | ✓ | **v3** |
| A6300 / A6500 | ILCE-6300/6500 | – | – | hot folder (tidak didukung Sony) |

Sumber: tabel kompatibilitas README paket Command 2.02.00. **PTP 3 tidak mencakup A7 II/A7 III** (PTP 3 hanya model 2020 ke atas), jadi tanpa PTP 2 kedua bodi itu tidak bisa dipakai.

**Keputusan: satu adapter `SonyCamera`, dua profil (v2/v3).** Alasan:
- Lapisan yang sama untuk keduanya: transport, handshake (`SDIO_Connect` ×3 + `SDIO_GetExtDeviceInfo`), polling status `SDIO_GetAllExtDevicePropInfo`, jepret S1/S2, unduh `0xFFFFC001`, live view `0xFFFFC002`, parser dataset. Itu ±80% kode.
- Yang berbeda kecil: nilai versi (0x00C8 vs 0x012C), cara ubah ISO/shutter/aperture/EV (v2 = langkah naik/turun, v3 = nilai absolut), tap-to-focus (hanya v3), status kartu/overheat (hanya v3). Cukup satu `SonyProfile` (record kecil), bukan dua adapter.
- Catatan 2027 hanya berlaku untuk bodi yang **juga** punya PTP 3 (tanda *4 di tabel: A7 IV, A7C II, A7R V, dst.). Karena bodi itu kita jalankan dengan v3, tidak terdampak. A7 II/A7 III tidak bertanda *4: PTP 2 satu-satunya jalur mereka dan firmware-nya sudah final, jadi kamera lama tetap jalan selama protokolnya tidak kita ubah. Risiko sisa: Sony tidak lagi memberi dukungan/dokumen v2; kode v2 kita tetap jalan.
- Pemilihan profil: dari `GetDeviceInfo` (model `ILCE-7M2`/`ILCE-7M3`/`ILCE-7RM3A`/A6x00 lama → v2, selain itu v3). Cadangan: kalau v3 ditolak (`0xA101 Authentication Failed` atau versi balasan 0x00C8), ulang handshake dengan v2. Tidak perlu daftar model lengkap di kode.

## 2. Transport USB di Windows

### Yang dipakai contoh Sony
- `example-v2/v3-windows` (C++ MFC): **WIA**. `IWiaDevMgr` → pilih kamera (dialog) → `IWiaItemExtras::Escape(ESCAPE_PTP_VENDOR_COMMAND)` dengan struktur `PTP_VENDOR_DATA_IN/OUT` (opcode, 5 parameter, fase data). Session PTP dibuka oleh driver, bukan aplikasi.
- `example-v2/v3-linux`: **libusb-1.0** langsung (bulk in/out/interrupt), aplikasi sendiri yang `OpenSession`.
- Manual contoh Windows: kamera harus muncul di Device Manager → **Portable Devices** dengan driver bawaan Windows **"MTP USB Device"**; kalau tidak, ganti driver ke itu. Tidak ada driver Sony yang perlu dipasang.
- `crsdk-win64/Driver.zip` = driver **libusbK** (bertanda tangan, `srcameradriver.inf`, ±65 PID Sony) untuk **Camera Remote SDK**, bukan untuk Command. Memasangnya **mengganti** driver MTP untuk PID tersebut sehingga jalur WPD/WIA tidak jalan lagi. **Jangan dipasang di laptop booth.** Imaging Edge Desktop/Remote juga sebaiknya tidak ada (pegang kamera eksklusif, dan bisa memasang driver sendiri).

### Pilihan untuk C# (.NET 10)

| | WPD (MTP extension) | WIA Escape | libusb / WinUSB |
|---|---|---|---|
| Driver di laptop | bawaan Windows (MTP USB Device) | bawaan Windows (sama) | ganti driver per kamera (Zadig/libusbK); A7 II/III mungkin tidak ada di INF Sony |
| Beban crew | nol | nol | tinggi, dan Explorer tidak bisa lagi membuka kamera |
| Bukti dengan Sony | belum (generik MTP; dipakai digiCamControl untuk Nikon/Canon) | **contoh resmi Sony** | contoh resmi Sony (Linux) |
| Data besar | baca bertahap (`READ_DATA` per potongan) tanpa tahu ukuran dulu | buffer keluaran harus dialokasi di depan (pakai ukuran `GetObjectInfo`) | bebas |
| Pilih perangkat tanpa UI | `IPortableDeviceManager.GetDevices` | `IWiaDevMgr.EnumDeviceInfo` + `CreateDevice` (hindari dialog) | enumerasi USB |
| Interop C# | COM `[ComImport]` + PROPVARIANT (±300 baris) | COM `[ComImport]` lebih sedikit (±150 baris) | P/Invoke libusb (LGPL, DLL ikut dikirim) |
| Mac (dev) | – (pakai transport palsu) | – | libusb jalan di Mac, tapi Rule 11: macOS baru Fase 6 |

**Keputusan: WPD MTP extension sebagai transport utama, WIA Escape sebagai cadangan di belakang antarmuka yang sama. libusb ditolak** (instal driver per laptop & per PID, merusak akses Explorer, DLL LGPL ikut dikirim, A7 II/III belum tentu ada di INF Sony).
- Perintah WPD (API publik Microsoft): `WPD_COMMAND_MTP_EXT_GET_SUPPORTED_VENDOR_OPCODES`, `..._EXECUTE_COMMAND_WITHOUT_DATA_PHASE`, `..._EXECUTE_COMMAND_WITH_DATA_TO_READ`, `..._EXECUTE_COMMAND_WITH_DATA_TO_WRITE`, `..._READ_DATA`, `..._WRITE_DATA`, `..._END_DATA_TRANSFER`; properti `WPD_PROPERTY_MTP_EXT_OPERATION_CODE/OPERATION_PARAMS/RESPONSE_CODE/RESPONSE_PARAMS/TRANSFER_CONTEXT/TRANSFER_TOTAL_DATA_SIZE/TRANSFER_NUM_BYTES_TO_READ/TRANSFER_DATA`.
- **Risiko terbesar, dicek paling awal (W-037):** driver MTP hanya meneruskan opcode vendor yang diiklankan kamera di `GetDeviceInfo`, dan mungkin menolak handle khusus `0xFFFFC001/2`. Kalau A7 III/A7 IV tidak meneruskan `0x9201–0x9209` lewat WPD, pakai **WIA Escape** (jalur yang dipakai contoh Sony, driver sama, crew tidak berubah).
- Tidak ada file Sony yang dikirim ke laptop (Command = dokumen protokol, bukan DLL). Berbeda dengan Canon (#112), **tidak perlu unduhan DLL**.

### Aturan "tanpa API khusus Windows" (CLAUDE.md #10)
Ikuti preseden Canon: `EdsdkDriver` memanggil DLL khusus Windows lewat P/Invoke di proyek lintas-platform, di balik `ICanonDriver`, dengan `FakeCanonDriver` untuk Mac/CI, dan hanya dibuat saat flag menunjuk SDK asli. Untuk Sony:
- `TetraCamera.Sony` (net10.0, build & test di Mac). Antarmuka `IPtpTransport` (satu method: kirim operasi PTP + data opsional → kode respons, parameter respons, data).
- `WpdTransport` (dan `WiaTransport` kalau perlu) = satu file COM interop bertanda `[SupportedOSPlatform("windows")]`, dibuat Host hanya saat `OperatingSystem.IsWindows()` dan flag `--sony` bukan `fake`; pola sama dengan `WindowsPrinterAdapter` (DECISIONS #15).
- `FakeSonyTransport` = **responder PTP simulasi** (handshake, dataset properti, buffer jepret, frame live view, cabut kabel). Lebih dalam dari palsu Canon: parser dan alur protokol ikut teruji di Mac.
- Dicatat di DECISIONS saat S1 (menyimpang dari TSD §2.2 yang masih menyebut Camera Remote SDK).

## 3. Fitur → opcode/properti (identifier saja)

Operasi: `GetDeviceInfo 0x1001`, `OpenSession 0x1002` (WPD/WIA membuka sendiri), `CloseSession 0x1003`, `GetObjectInfo 0x1008`, `GetObject 0x1009`, `SDIO_Connect 0x9201`, `SDIO_GetExtDeviceInfo 0x9202`, `SDIO_SetExtDevicePropValue 0x9205`, `SDIO_ControlDevice 0x9207`, `SDIO_GetAllExtDevicePropInfo 0x9209`. Respons vendor: `0xA101` auth gagal, `0xA105` buffer sementara penuh, `0xA106` status kamera error. Standar: `0x2009` handle tidak valid (live view belum siap), `0x200F` access denied (frame belum ada, ulangi), `0x2019` device busy.

| Kebutuhan | v2 (A7 II/III) | v3 (A7 IV/V/C) |
|---|---|---|
| Handshake | `0x9201` p1=1, lalu p1=2 (key 0,0) → `0x9202` p1=`0x00C8` (ulang selama data kosong) → `0x9201` p1=3 | sama, `0x9202` p1=`0x012C` (p2 = flag properti diperluas `0x1` bila versi vendor ≥ 3.10, opsional) |
| Daftar fitur yang benar-benar didukung bodi | array kode properti & kontrol di dataset `0x9202` → dipakai untuk mematikan fitur yang tidak ada (jangan andalkan tabel model) | sama |
| Prioritas PC | – | `Position Key Setting 0xD25A` = `0x01` (kembali 0 saat sesi ditutup → set ulang tiap sambung) |
| Status berkala | `0x9209` tiap ±200 ms saat idle (Sony menyarankan polling; event vendor tidak dijamin di model lama) | sama; event `0xC201/0xC203/0xC206` boleh diabaikan (A7 V tidak punya `0xC201`) |
| Jepret | kontrol `S1 0xD2C1` Down → tunggu `Focus Indication 0xD213` (maks ±1,5 s) → `S2 0xD2C2` Down → Up → S1 Up. Nilai: Up `0x0001`, Down `0x0002`. Alternatif tanpa AF: `RequestOneShooting 0xD2C7` | sama, atau `S1 & S2 Button 0xD2E6` sekali jalan |
| File siap | `Shooting File Info 0xD215`: bit `0x8000` = file di buffer | sama |
| Unduh JPEG penuh | `GetObjectInfo(0xFFFFC001)` (format `0x3801` JPEG, `0xB101` RAW) → `GetObject(0xFFFFC001)`; ulang selama `0xD215` ≠ 0, ambil JPEG, buang RAW/HEIF | sama |
| Simpan ke | `Still Image Save Destination 0xD222` (`0x0001` PC, `0x0010` kartu, `0x0011` keduanya); A7 II tidak punya properti ini (selalu ke PC) | sama; set lewat `0x9205` kalau GetSet = 1, kalau tidak dari menu kamera |
| Live view | tunggu `Live View Status 0xD221` = `0x01` → `GetObjectInfo(0xFFFFC002)` sekali → `GetObject(0xFFFFC002)` berulang, jeda ≥ 33 ms (maks 30 fps). Dataset: offset (u32) + ukuran (u32) + JPEG | sama + offset/ukuran Focal Frame Info (kotak fokus, opsional). Kualitas `Live View Image Quality 0xD26A` (`0x01` Low / `0x02` High) |
| AF (setengah tekan) | S1 Down/Up | sama |
| Tap-to-focus | **tidak ada** (A7 III hanya `Focus Area 0xD22C` = mode area; A7 II tidak ada) → `FocusAtAsync` = false | kontrol `AF Area Position 0xD2DC` (x di 2 byte atas 0–639, y di 2 byte bawah 0–479; mode area harus Spot/Expand Flexible Spot), lalu S1. Alternatif `Remote Touch Operation 0xD2E4` bila `0xD284` = enable. Rentang efektif `Live View Area 0xD267` |
| Fokus manual near/far | kontrol `Near/Far 0xD2D1` (langkah ±; hanya MF, cek `0xD235`); A7 II kemungkinan tidak ada | `0xD2D1` |
| ISO | properti `0xD21E` read-only; ubah = langkah notch lewat `0x9207` lalu baca ulang sampai label target (**tabel PTP 2 hanya mencantumkan kontrol ini untuk bodi baru; A7 II/III wajib diuji, W-040**) | `0x9205` nilai absolut (u32, ISO langsung) dari daftar enum di `0x9209` |
| Shutter | `0xD20D` sama seperti ISO (langkah) | `0xD20D` nilai u32 pembilang/penyebut; ubah lewat kontrol langkah `0x9207` (catatan v3) atau `0x9205` sesuai GetSet di dataset |
| Aperture | `0x5007` (langkah) | `0x5007` absolut |
| White balance | `0x5005` absolut (`0x9205`), suhu warna `0xD20F` | `0x5005`, suhu warna `0xD20F` / langkah `0xD2EC` |
| Exposure comp. | `0x5010` (langkah, nilai ×1000) | `0x5010` absolut |
| Mode eksposur (info) | `0x500E` (tunggu 500 ms setelah ganti sebelum set lain) | sama |
| Baterai | `Battery Remaining 0xD218` (%), `Battery Level Indicator 0xD20E` | sama (+ `0xD204` total bila grip) |
| Kartu | – (tidak ada di A7 II/III; aman bila simpan ke PC saja) | `Media SLOT1 Status 0xD248` (0x02 tanpa kartu, 0x03/0x09 error/read-only), `Remaining shots 0xD249` |
| Error lain | respons `0xA105`/`0xA106`, jepret tidak menghasilkan file dalam batas waktu | + `Device Overheating 0xD251`, `Camera Error Caution 0xD1BB` (A7 IV/V) |
| Sambung ulang | panggilan WPD gagal (perangkat hilang) → tutup, enumerasi ulang tiap 2 s (seperti Canon), handshake ulang | sama |

Pemetaan ke `ICameraSource`: `CaptureAsync` (jepret + unduh JPEG ke `<outputDir>/<n>.jpg`), `LatestFrame` (frame terbaru, Host `/liveview.jpg` tanpa perubahan), `FocusAsync("af"|"near1..3"|"far1..3")`, `FocusAtAsync` (v3), `PropsAsync/SetPropAsync` dengan nama setelan sama dengan Canon (ISO/shutter/aperture/WB) supaya sheet crew dipakai bersama, `Stuck` (thread tidak berdetak). Protokol WS (`camera-protocol.ts`) sudah punya brand `sony`; tidak ada perintah baru.

## 4. Setelan di kamera (bahan CHECKLIST-EVENT nanti)

Nama menu bisa beda per firmware; **diverifikasi di bodi saat W-038/W-039** lalu baru masuk CHECKLIST-EVENT.

| Setelan | A7 II | A7 III | A7 IV / A7 V | A7C |
|---|---|---|---|---|
| Mode USB | Setup → USB Connection = **PC Remote** | Setup → USB Connection = **PC Remote** | Setup → USB → USB Connection Mode = **Remote Shooting (PC Remote)** (atau "Select When Connect" lalu pilih PC Remote tiap colok; tetap lebih aman) | Setup → USB Connection = **PC Remote** (verifikasi) |
| PC Remote aktif | otomatis | otomatis | Network → Transfer/Remote → PC Remote Function: **PC Remote = On**, Cnct Method = **USB** | verifikasi |
| Simpan ke | (tidak ada pilihan, ke PC) | PC Remote Settings → Still Img. Save Dest. = **PC Only** | Still Img. Save Dest. = **PC Only** | sama |
| RAW+JPEG | format **JPEG** saja | RAW+J PC Save Img = **JPEG Only**, format **JPEG** | sama; Still Image Trans. Size = **Original** (bukan 2M) | sama |
| Kualitas | JPEG Fine/Extra Fine, ukuran L, rasio 3:2 | sama | sama | sama |
| Hemat daya | Power Save Start Time = **30 min** | sama | Power Setting Option → Auto Power OFF Temp. = **High**, Power Save Start Time = **30 min** | sama |
| Daya | dummy battery (A7 II tidak bisa dipakai sambil diisi via USB) | USB Power Supply = **On** atau dummy battery | USB Power Supply = **On** | USB Power Supply = **On** |
| Fokus | AF-S, area Flexible Spot/Wide | AF-S; tap-to-focus tidak ada | AF-S, Focus Area = **Spot/Expand Flexible Spot** supaya tap-to-focus jalan | sama seperti A7 IV |
| Lain | Wi-Fi/Bluetooth off, Audio signals off, firmware terbaru | sama | sama; Touch Operation boleh on | sama |

Laptop: Device Manager → Portable Devices → kamera dengan driver **MTP USB Device** (bawaan). Tutup Imaging Edge; jangan pasang driver libusbK dari paket SDK. Kabel USB langsung ke laptop (bukan hub), USB-C untuk A7 III/IV/V/C.

## 5. Fase kerja

Urutan kerja Mac dulu (S1–S5 di `main`, semuanya teruji dengan transport palsu), uji Windows lewat W-task di `docs/HANDOFF.md` (branch `win`). Spike transport W-037 dikirim **segera setelah S1**, sebelum S2–S5, karena menentukan WPD vs WIA.

### S1 — Transport + handshake + palsu (Mac) · ±2 hari
- Proyek `TetraCamera.Sony` (masuk `TetraCamera.slnx`, referensi `TetraCamera.HotFolder` untuk `ICameraSource`/`CameraFailure`).
- `PtpCodes` (konstanta di atas), `IPtpTransport`, `SonyProtocol` (handshake v2/v3, parser `SDIExtDeviceInfo` dan dataset properti `0x9209`: tipe int8–u64, STR, form Range/Enum dengan dua daftar enum).
- `FakeSonyTransport` (model v2 & v3, `Plugged`, `HangMs`, JPEG contoh dari `fake.jpg` yang sudah ada) + xUnit: handshake kedua versi, fallback v3→v2, parser, cabut kabel.
- `WpdTransport` (Windows saja, `[SupportedOSPlatform]`) + konsol uji kecil `--sony-probe` di Host: daftar perangkat, `GET_SUPPORTED_VENDOR_OPCODES`, handshake, cetak model + versi + jumlah properti.
- Thread SDK: ekstrak antrean/detak/sambung-ulang dari `CanonCamera` ke helper kecil bersama **hanya kalau** duplikasinya > ±100 baris; kalau tidak, salin pola. Semua panggilan transport (termasuk COM, MTA) di satu thread antrean.
- Host: flag `--sony <fake|wpd|wia>`; booth `config.ts`: `camera: "sony"`, `--camera=sony` (mode crew "Kamera Mirrorless Sony"). DECISIONS + TSD §2.2 diperbarui.

### S2 — Jepret + unduh · ±1 hari
- `CaptureAsync`: S1 → (tunggu fokus, batas waktu) → S2 Down/Up → S1 Up → polling `0xD215` → `GetObjectInfo/GetObject 0xFFFFC001` sampai kosong → JPEG ke `<outputDir>/<n>.jpg`, RAW dibuang. Batas waktu 10 s seperti Canon; `0xA105` → kosongkan buffer dulu.
- Uji: palsu (sukses, RAW+JPEG, tidak ada file → `capture_timeout`, kabel dicabut di tengah). e2e booth dengan `--sony fake` (sesi penuh sampai cetak ke PDF).

### S3 — Live view · ±1 hari
- Tunggu `0xD221`, `GetObjectInfo(0xFFFFC002)` sekali, loop `GetObject(0xFFFFC002)` ≥ 33 ms, parse offset/ukuran, `0x200F` = lewati frame. Polling `0x9209` diselipkan tiap ±200 ms di thread yang sama. Live view dijeda saat jepret, dinyalakan ulang setelahnya. v3: `0xD26A` = High.
- Target ≥ 20 fps di laptop booth (TSD §2); diukur di W-038.

### S4 — Setelan & AF · ±2 hari
- `PropsAsync/SetPropAsync` ISO/shutter/aperture/WB/EV: label dari kode (tabel kecil `SonyProps`, ditulis sendiri dari nilai dataset, bukan salinan tabel Sony), opsi dari daftar enum dataset. v3 absolut (`0x9205`); v2 langkah (`0x9207` ±1, baca ulang sampai target, maks N langkah). Setelan crew tersimpan & dipasang ulang saat sambung (pola #113).
- `FocusAsync("af")` = S1 Down/Up; near/far = `0xD2D1`; `FocusAtAsync` (v3) = `0xD2DC` dengan koordinat 0–639 × 0–479 dari titik 0–1 di frame, lalu S1; v2 → false (UI booth sudah menangani "tidak didukung").
- Status: baterai `0xD218` ke `camera.status`.

### S5 — Sambung ulang & error · ±1 hari
- Kabel dicabut / kamera tidur → `camera.disconnected`, enumerasi ulang tiap 2 s, handshake + `0xD25A` + setelan crew dipasang ulang → `camera.connected`. `Stuck` saat panggilan transport tidak kembali (supervisor restart Camera Service, seperti #111).
- Pesan crew (copy booth): kartu tidak ada/penuh/terkunci (v3 `0xD248/0xD249`), baterai lemah, kamera panas (`0xD251`), kamera bukan mode PC Remote (handshake gagal), driver salah (perangkat tidak muncul sebagai MTP), Imaging Edge masih terbuka (perangkat sibuk).

### S6 — Uji hardware Windows (W-task, laptop booth + A7 III + A7 IV) · ±2–3 hari kalender
- **W-037 (setelah S1):** `--sony-probe` dengan A7 III dan A7 IV: driver = MTP USB Device, `GET_SUPPORTED_VENDOR_OPCODES` memuat `0x9201/0x9202/0x9205/0x9207/0x9209`, handshake v2 (A7 III) & v3 (A7 IV) OK, `GetObjectInfo(0xFFFFC002)` lewat WPD tidak ditolak. Gagal → aktifkan `WiaTransport` dan ulang.
- **W-038 (setelah S3):** A7 III: 50 jepret berturut-turut (semua JPEG penuh tersimpan, waktu jepret→file), live view fps & jeda saat jepret, sesi booth penuh sampai cetak.
- **W-039 (setelah S3):** sama untuk A7 IV + tap-to-focus + simpan PC Only vs PC+Kamera.
- **W-040 (setelah S4):** setelan ISO/shutter/aperture/WB/EV dari mode crew di A7 III (langkah v2) dan A7 IV (absolut); catat apakah kontrol langkah diterima A7 III.
- **W-041 (setelah S5):** cabut-colok USB saat live view & saat jepret, kamera tidur (power save) lalu bangun, baterai dicabut, kartu dicabut (A7 IV), Imaging Edge terbuka; booth pulih sendiri tanpa restart aplikasi. Hasil → `docs/reports/windows/`, nama menu kamera yang benar → CHECKLIST-EVENT.
- A7 II, A7 V, A7C: smoke test (probe + 10 jepret) kalau bodinya tersedia, tidak memblokir.

**Total perkiraan:** ±7 hari kerja Mac + 2–3 hari uji Windows (tergantung ketersediaan laptop & kamera).

## 6. Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Driver MTP Windows tidak meneruskan opcode vendor/handle khusus Sony lewat WPD | transport utama gagal | W-037 paling awal; cadangan WIA Escape (jalur contoh Sony, driver sama) |
| A7 II/III tidak menerima kontrol langkah ISO/shutter/aperture | setelan tidak bisa dari booth | W-040; jatuh ke "atur di kamera" (props read-only tampil di mode crew) |
| Latensi WPD per frame | live view < 20 fps | `0xD26A` Low, ukur di W-038; WIA/ chunk size; kalau tetap rendah terima ≥ 15 fps |
| Kamera tidur / power save memutus USB di tengah event | sesi gagal | setelan 30 min + USB power, sambung ulang otomatis, CHECKLIST |
| Laptop pernah dipasangi Imaging Edge / driver libusbK | kamera tidak muncul sebagai MTP | pesan crew + langkah rollback driver di CHECKLIST |
| PTP 2 dihentikan Sony | dukungan/doc hilang untuk A7 II/III | kode tidak berubah; bodi lama tetap jalan. Bodi baru selalu v3 |
| Nama menu kamera beda per firmware | checklist salah | verifikasi di W-038/039 sebelum masuk CHECKLIST |
| Lisensi Sony | repo public | hanya identifier di kode; PDF/contoh/SDK tetap di `sdk/` yang di-gitignore |

## 7. Pertanyaan untuk owner (Rama)

1. Bodi mana yang paling sering dibawa ke event? Default rencana: **A7 III dulu** (v2), A7 IV menyusul di fase yang sama.
2. Simpan foto: **PC saja** (default, tidak butuh kartu, tidak ada error kartu penuh) atau **PC + kartu** sebagai cadangan?
3. A7 IV, A7 V, A7C benar ada dan bisa dipinjam untuk W-039/smoke test? Kapan laptop Windows tersedia?
4. Apakah laptop booth pernah dipasangi Imaging Edge Desktop/Remote atau driver dari paket Sony SDK?
5. Kalau A7 II/III ternyata tidak bisa diubah ISO/shutter dari booth, cukupkah crew mengatur di kamera?
6. Ada dummy battery untuk A7 II/A7 III (event panjang)?
