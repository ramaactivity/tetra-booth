# 15 Okt 2026 — Sony A7 III, Sony ZV-E10, Lumix GH5 dengan kamera asli (B02)

Laptop booth B02 (Windows 11), booth dev dari `win` + booth terpasang 0.6.36. Kamera milik Rama, kabel USB-C langsung.
Tidak ada cetak fisik. Canon tidak diubah (diff `services/camera/TetraCamera.Canon` = 0 baris di commit hari ini).

## Ringkasan

| Kamera | Sambung | Live view | Jepret | Setelan dari booth | Sesi tamu | Cabut-pasang / mati-nyala |
|---|---|---|---|---|---|---|
| A7 III (v2, fw 4.0) | lulus | lulus, meter ketajaman | lulus, ±40 jepret 2,1–2,9 s, 6000×4000 | ISO/shutter/F (langkah 0x9207), WB | — | lulus / lulus |
| ZV-E10 mk1 (v3, fw 1.00) | lulus | lulus, 1024×576 | lulus, 2,2–2,9 s | ISO/shutter/F/WB absolut | 2 sesi lulus (booth 0.6.36) | belum |
| GH5 (fw 2.8) | lulus | lulus, 640×432 | lulus, 0,9–1,3 s (service), 2,8 s (Tes Jepret) | ISO/shutter/F/WB/EV | 3 sesi, sebagian jepret gagal karena booth ganda (lihat bawah); urutan sesi lulus 18/18 di service tunggal; ulang di booth belum | belum |

`copy.crew.sonyUntested` dan `lumixUntested` dikosongkan (permintaan Rama).

## Sony A7 III (W-037 lulus, W-038 sebagian)

- **Rana diam** bila Still Img. Save Dest. = PC+Camera dan kartu tidak ada/penuh. Kamera tetap menjawab OK dan tidak
  melaporkan status kartu (tidak ada 0xD248 di v2). Pesan capture_timeout kini menyebut kartu bila tujuan simpan termasuk kartu.
- ISO/shutter/F `GetSet=0` dan tidak ada di daftar kontrol, tapi `SdioControlDevice(kode, ±n INT8)` mengubahnya
  (+1 = ISO lebih tinggi / shutter lebih cepat / F lebih besar). Shutter/F tanpa daftar enum → tabel 1/3 stop.
- Dataset pertama setelah sambung tidak lengkap (ISO 0, shutter/F nonaktif) → `Prepare` menunggu `DatasetReady` (maks. 3 s).
- AutoPlay Windows merebut kamera MTP saat dinyalakan (0x800700AA) → `DisableAutoplay=1` di HKCU B02.

## Sony ZV-E10 mark 1

- Menu USB Connection terkunci di Mass Storage (PnP: `USBSTOR\DISK&VEN_SONY&PROD_DSC`, PID 0D95) sampai
  **Network → PC Remote Function → PC Remote = On, Cnct Method = USB**. Setelah itu WPD `ZV-E10` PID 0D97.
  Firmware 1.00 cukup.
- Probe `--sony-probe wpd`: LULUS, v3 versi 0x012C, 93 properti, 29 kontrol, simpan 0xD222=1.
- `--sony-shoot`: S1 → fokus 0xD213=2 (+967 ms), S2 → file 0x8001 (+221 ms setelah lepas).
- `--sony-set`: ISO/shutter/F absolut (cara A) berhasil; EV aktif=2 di M (wajar).
- Foto bawaan **16:9** (6000×3376) → prop crew baru "Rasio foto" (0xD211: 1=3:2, 2=16:9, 3=4:3, 4=1:1) dan pengingat
  Aspect Ratio 3:2.
- Booth terpasang 0.6.36 menolak ISO 3200 ("putar dial mode ke M") tepat 2 s setelah jepret: `Settle` 1500 ms terlalu
  pendek (ISO ±1 s, lebih lama setelah jepret) → `SettleMs` 3000. Uji ulang ISO 3200/500/12800/100/Auto: semua ok 0,07–1,2 s.

## Lumix GH5 (W-043)

Probe `--lumix-probe` LULUS: model `DC-GH5`, jepret 5184×3456 (3:2), live view JPEG. Struct layout dari header cocok.

Temuan dan perbaikan:
- **Mode video** = rana diterima (OK) tapi tidak ada event objek → capture_timeout. Pesan kini menyebut dial M.
- ISO capability berisi nilai extended `0x10000064/7D/A0` = bit 28 → label `ISO L.100/L.125/L.160`.
- Shutter 50"/40" (`0x8000C350`, `0x80009C40`) ditambahkan.
- EV capability berupa **rentang** (u16 min @2 = 0x800F, max @4 = 0x000F), daftar kosong → pilihan dibangkitkan −5…+5 EV.
  Di M + ISO manual kamera menolak EV (err 0) → pesan jelas; dengan ISO Auto EV berubah.
- Aperture capability = semua nilai 0,1 stop f/1.7–f/9.9 + f/10–f/22; yang tampil hanya stop standar (warning probe wajar).
- Rana ditolak err 0 saat foto sebelumnya masih ditulis (jepret ke-3 jeda 1,5 s gagal) → coba ulang maks. 4 s. Setelahnya
  6 jepret jeda 0,2 s lulus.
- MF near/far (`MF_BAR`) ditolak err 0 di AFS/AFC, berhasil di MF (near1–3, far1–3 semua ok). AF one-shot ok di semua mode.
- Callback `Reg_NotifyCallback` untuk ID event selain 0x10000040/43 mengembalikan ≠1 (tidak terdaftar); pompa pesan
  Windows tidak diperlukan (event datang di thread DLL).

**Booth ganda:** sesi Rama 20:38–20:43 gagal/terlambat ("kamera tidak mengirim foto", `foto gagal diunduh: ukuran 0`
±2 s setelah tiap jepret). Log: booth terpasang (`…\Programs\booth\resources\camera\TetraCamera.exe`, 13:38:01Z) dan
booth dev (13:38:08Z) berjalan bersamaan dan sama-sama membuka GH5. Dengan satu service: 6/6 + 6/6 + 6/6 jepret lulus
(urutan sesi: live view nyala → jepret dengan ISO/shutter jepret → live view mati → baca setelan + status, sambil
mengambil frame tiap 40 ms). Saran Mac: kunci satu instans per data folder (dev dan terpasang memakai
`%APPDATA%\TetraBooth` yang sama).

## UI

- Tombol **Batal** sesi pindah ke kiri atas: di kanan atas menutupi angka hitung mundur (Rama).
- Tombol **Tunggu dulu** naik ke `bottom-[84px]`: di `bottom-12` menutupi pil status printer (`bottom-5`) (Rama).
  Dicek dengan screenshot hitung mundur di booth dev: Batal kiri atas, angka kanan atas, Tunggu dulu di atas pil printer.

## Gate e2e di B02 malam ini

Suite penuh paralel gagal 3–7 tes yang berganti-ganti (attract 2x6x2, crew cloud "Menghitung…", gallery, rerender,
stage, sony Tes Jepret), padahal tes yang sama lulus saat dijalankan sendiri. Uji A/B: `booth-core` 67e644f (sebelum
perubahan hari ini) gagal 7 tes di kondisi yang sama → lingkungan (VS Code sedang update di latar, beban tinggi),
bukan regresi. Gate dijalankan ulang dengan `--workers=1`.
- Pengingat setelan Lumix di halaman Kamera crew (seperti Sony), tips Lumix: Aspect 3:2, dial M bukan video, MF untuk near/far.

## Untuk Mac

1. Merge commit Sony/Lumix hari ini dari `win` (hanya `TetraCamera.Sony`, `TetraCamera.Lumix`, Host flag
   `--lumix-shoot`, tes, `booth-core` copy/CrewMenu/CancelSession). **Canon tidak berubah.**
2. `beef6c3` (Canon 14 Okt) masih belum di main. Rama 15 Okt: "saat ini canon sudah stabil… tidak ada yang berubah" —
   tahan dulu sampai Rama memutuskan.
3. Kunci satu instans booth per folder data (lihat "Booth ganda").
4. Belum diuji: ZV-E10 & GH5 cabut-pasang / mati-nyala, sesi tamu dengan cetak.

## Keluaran probe

ZV-E10 `--sony-probe wpd`:

```
INFO  perangkat WPD: ZV-E10 | Sony Corporation | ZV-E10
OK    buka kamera
OK    opcode vendor dari driver: 15 opcode, lengkap: 0x9207 0x9209 0x920A 0x920B 0x920C 0x920D 0x920E 0x920F 0x9210 0x9211 0x9212 0x9201 0x9202 0x9214 0x9205
INFO  GetDeviceInfo: Sony Corporation ZV-E10 fw 1.00, profil v3
INFO  SDIO_GetExtDeviceInfo: versi 0x012C, 93 properti, 29 kontrol
OK    handshake: ZV-E10 profil v3, versi 0x012C
OK    operasi di GetDeviceInfo: 31 operasi, vendor lengkap
OK    SDIO_GetAllExtDevicePropInfo: 93 properti, enum dua daftar; baterai 0xD218=71, live view 0xD221=0, simpan 0xD222=1, ISO 0xD21E=500
OK    GetObjectInfo 0xFFFFC002 diteruskan driver: kamera menjawab 0x2009
OK    GetObjectInfo 0xFFFFC001 diteruskan driver: kamera menjawab 0x2001
HASIL: LULUS
```

GH5 `--lumix-probe` (setelah perbaikan):

```
Model: DC-GH5
ISO live view: ISO 3200 · 26 pilihan
Shutter: 1/100 · 59 pilihan
Aperture: f/1.7 · 96 pilihan · tanpa label: 0xD2 0xBE 0xAA … (nilai 0,1 stop, wajar)
White balance: Auto (warm) · 16 pilihan
Kompensasi eksposur: 0.0 EV · 31 pilihan
Live view: 640x360
Jepret: lumix-probe.jpg (5184x3456)
```

GH5 `--lumix-shoot` (dial M):

```
tersambung DC-GH5 (thread 2, MTA)
callback tambahan terdaftar: 0
--- jepret, pompa pesan: tidak
rana dikirim +109 ms
FOTO +1243 ms 6737408 byte
--- jepret, pompa pesan: ya
rana dikirim +1277 ms
FOTO +2344 ms 6740480 byte
```

## Tambahan: GH5 cabut-pasang / mati-nyala dengan booth dev berjalan

- Kamera hilang → `kamera tidak merespons … dianggap terputus` → `tersambung: DC-GH5` dalam ±8 s (14:57:10Z → 14:57:19Z). Lulus.
- Setelah tersambung, setelan tersimpan (ISO 3200, 1/50, f/1.7, Daylight) **ditolak** (err 0): GH5 belum siap tepat
  setelah menyala/tersambung. Perbaikan di `LumixDriver.SetProp` saja (Canon tidak disentuh): coba ulang tiap 250 ms
  selama 6 s pertama setelah Open (tenggat bersama, jauh di bawah `StuckAfter` 20 s). **Belum diuji di kamera asli**
  (GH5 dipakai Rama).
