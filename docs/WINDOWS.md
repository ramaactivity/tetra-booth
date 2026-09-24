# Runbook: Claude Code di laptop Windows

Dibaca oleh Claude Code yang berjalan di laptop Windows.

## 0. Profil mesin (baca dulu)

| Profil | Status | Aturan |
|---|---|---|
| **A. Laptop booth milik Rama** | **Aktif sejak 2026-09-24** | §0.1 di bawah. §2 (aturan laptop pinjaman) **tidak berlaku**. |
| B. Laptop pinjaman teman Rama | Cadangan, dipakai lagi bila Rama minta. Deploy key tetap aktif (id `164304172`) | §2, §3 (`env.ps1`), §7 |

### 0.1 Aturan laptop booth Rama (profil A)

1. Workspace `C:\TetraBooth` (path pendek, tanpa spasi), repo di `C:\TetraBooth\tetra-booth`. Data uji booth di `C:\TetraBooth\data`, folder hot folder `C:\TetraBooth\hot`, output PDF `C:\TetraBooth\prints`.
2. Tool dipasang permanen lewat `winget` (Rama ada di depan laptop untuk klik izin Windows). Driver DNP dan EOS Utility boleh dipasang **setelah Rama setuju**; unduh dari situs resmi DNP/Canon.
3. GitHub lewat login Rama sendiri (`gh auth login` yang dijalankan Rama). `gh` boleh dipakai untuk melihat CI (`gh run list --branch win`).
4. **Cetak fisik DNP menghabiskan kertas & ribbon.** Setiap tugas menyebut jatah lembar; jangan lewati tanpa izin Rama. Catat jumlah lembar yang keluar di laporan.
5. Stress test & uji panjang pakai **Microsoft Print to PDF**, bukan DNP.
6. Canon EDSDK belum ada (menunggu pendaftaran developer Canon). Kamera 60D diuji lewat **EOS Utility → hot folder** (M7). DLL EDSDK nanti di `services\camera\TetraCamera.Canon\sdk\` (tidak di-commit).
7. Protokol git tetap §4 (Windows di `win`, Mac di `main`). Env: cukup `$env:ELECTRON_RUN_AS_NODE` dikosongkan sebelum menjalankan Electron; `env.ps1` dan prefix §3 hanya untuk profil B.
8. Rama ada di depan laptop: aksi fisik (tekan shutter, ganti kertas, colok USB) boleh diminta langsung di chat, satu kalimat jelas per langkah.

## 1. Peran

| Mesin | Siapa | Tugas |
|---|---|---|
| MacBook Rama | Claude "Mac" | Koding utama, semua bagian lintas platform, menulis tugas untuk Windows |
| Laptop Windows (ini) | Claude "Windows" | Menjalankan & menguji yang butuh Windows asli: build/run di Windows, printer, kiosk, kamera Canon + EDSDK, stress test. Memperbaiki kode khusus Windows. |

Kedua Claude tidak berbagi ingatan. Satu-satunya jalur komunikasi: **repo git** (`docs/HANDOFF.md`, `docs/reports/windows/`, commit).

## 2. Aturan laptop pinjaman (wajib)

1. Semua pekerjaan di `%USERPROFILE%\TetraBooth` (disebut `$W`). Jangan membuka, membaca, atau mengubah file pribadi pemilik laptop.
2. Jangan menjalankan apa pun yang butuh admin/UAC (tidak ada yang bisa klik "Yes"). Jangan ubah setelan Windows: power plan, execution policy permanen, PATH/env user atau sistem, registry, startup, firewall.
3. Semua tool portable di `$W\tools`, semua cache di `$W` (lihat `env.ps1`). Membersihkan laptop = menghapus `$W`.
4. Tidak ada rahasia di laptop ini: tidak ada `.env.local`, key Supabase/R2, atau password. Fase 1 berjalan offline dan tidak membutuhkannya.
5. Akses GitHub hanya lewat deploy key repo `ramaactivity/tetra-booth` di `$W\.keys\deploy`. Jangan login GitHub/akun lain.
6. Screenshot **hanya jendela aplikasi kita** (Electron/booth), tidak pernah layar penuh: layar penuh bisa merekam jendela pribadi pemilik laptop. Hanya untuk dilihat sendiri, jangan di-commit, hapus setelah dipakai.
7. Butuh keputusan Rama → tulis pertanyaan singkat di chat, lalu berhenti. Jangan menebak. Butuh aksi fisik dari teman Rama (colok kamera/printer) → tulis instruksi satu kalimat untuk diteruskan Rama.

## 3. `env.ps1` dan prefix setiap perintah PowerShell

Isi `$W\env.ps1` (diperbarui 2026-09-24 setelah laporan W-014/W-015; baris lama `npm_config_store_dir` tidak dibaca pnpm 12):

```powershell
$W = "$HOME\TetraBooth"
$env:Path = "$W\tools\node;$W\tools\dotnet;$W\tools\git\cmd;" + $env:Path
# .NET / NuGet
$env:DOTNET_ROOT = "$W\tools\dotnet"; $env:DOTNET_CLI_HOME = $W
$env:DOTNET_CLI_TELEMETRY_OPTOUT = "1"; $env:DOTNET_NOLOGO = "1"
$env:NUGET_PACKAGES = "$W\.nuget"
$env:NUGET_HTTP_CACHE_PATH = "$W\.nuget-http"
$env:NUGET_PLUGINS_CACHE_PATH = "$W\.nuget-plugins"
# npm (pnpm global) dan pnpm 12 (hanya membaca pnpm_config_*, bukan npm_config_*)
$env:npm_config_prefix = "$W\tools\node"; $env:npm_config_cache = "$W\.npm-cache"
$env:pnpm_config_store_dir = "$W\.pnpm\store"
$env:pnpm_config_cache_dir = "$W\.pnpm\cache"
$env:pnpm_config_state_dir = "$W\.pnpm\state"
# Electron & electron-builder (ELECTRON_BUILDER_CACHE wajib path absolut)
$env:electron_config_cache = "$W\.electron-cache"
$env:ELECTRON_BUILDER_CACHE = "$W\.electron-builder-cache"
$env:PLAYWRIGHT_BROWSERS_PATH = "$W\.playwright"
# Tool lain
$env:TURBO_TELEMETRY_DISABLED = "1"
$env:TEMP = "$W\tmp"; $env:TMP = "$W\tmp"   # e2e booth memakai os.tmpdir()
New-Item -ItemType Directory -Force "$W\tmp" | Out-Null
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
```

Yang tetap bocor ke AppData (tidak bisa dipindah lewat env) dan harus dibersihkan di §7: zip Electron dari electron-builder (`%LOCALAPPDATA%\electron\Cache`, lewat `@electron/get` tanpa override env di electron-builder 26), `%APPDATA%\NuGet\NuGet.Config`, konfigurasi/telemetri turbo, cache Biome/Vitest bila ada. **Laptop pinjaman yang sudah berjalan:** tambahkan semua baris baru **kecuali tiga baris `pnpm_config_*`**. Mengaktifkannya sekarang = pnpm memakai store baru dan mengunduh ulang ±1 GB di jaringan lambat. Store lama di AppData tetap dipakai dan dihapus saat laptop dikembalikan (§7). Tiga baris itu untuk setup baru saja (keputusan 2026-09-24, DECISIONS #39).

### Prefix setiap perintah

Execution policy default Windows memblokir script, dan env tidak bertahan antar perintah. Awali **setiap** perintah dengan:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force; . "$HOME\TetraBooth\env.ps1"; <perintah>
```

`-Scope Process` hanya berlaku untuk proses itu, tidak mengubah setelan.

## 4a. Kanal pesan: GitHub Issue #1 (sejak 2026-09-24)

Pesan cepat Mac ↔ Windows lewat **issue #1 "Kanal Mac ↔ Windows (Claude)"** (`gh issue view 1 --comments`, `gh issue comment 1 --body "…"`). Aturan lengkap di badan issue. Ringkasnya:
- Baris pertama tiap komentar: `[WIN→MAC]` / `[MAC→WIN]` + `TUGAS BARU` / `SELESAI` / `BUTUH KEPUTUSAN` / `BLOKIR` / `INFO`, lalu commit terkait.
- Setiap push laporan ke `win` → komentar `SELESAI` di issue #1.
- Antrean kosong atau menunggu → **jangan berhenti**: pantau issue #1 dan `origin/main` tiap ±5 menit (Monitor/loop Claude Code) sampai ada tugas/pesan baru atau Rama menghentikan. Setelah pesan `TUGAS BARU`: `git fetch`, merge `origin/main` ke `win`, baca HANDOFF.

## 4. Protokol sinkron (git)

- Mac bekerja di `main`. **Windows hanya bekerja di branch `win`.** Jangan push ke `main`, jangan force-push, jangan rewrite history.
- **Awal sesi:** `git fetch origin` → `git checkout win` → `git merge origin/main` (selesaikan konflik; kalau ragu, tanya). Lalu baca `docs/HANDOFF.md`.
- **Kerja:** ambil tugas teratas yang belum dicentang di bagian "Untuk Windows". Commit kecil, pesan konvensional (`fix(camera): ...`, `test(win): ...`).
- **Akhir tugas:** tulis laporan `docs/reports/windows/YYYY-MM-DD-<topik>.md` (apa yang diuji, hasil, angka, error persis, file diubah), centang tugas di HANDOFF, tambahkan satu baris di "Log", commit, `git push origin win`. CI berjalan otomatis untuk branch `win`.
- Butuh sesuatu dari Mac (bug di kode lintas platform, keputusan desain) → tulis di bagian "Untuk Mac" di HANDOFF.
- Mac membaca laporan, lalu merge `win` ke `main`.
- Keputusan teknis baru atau penyimpangan dari dokumen → catat di `docs/DECISIONS.md` (aturan `CLAUDE.md`).

## 4b. Printer DNP RX1HS: potong 2 inci & kalibrasi posisi (DECISIONS #59)

- **Potong 2 inci tidak bisa diatur dari program.** Driver DNP `DS-RX1` mengikuti **dialog Printing Preferences yang terakhir di-OK** (antrean mana pun). Per event: Settings → Printers → DS-RX1 → Printing preferences → Advanced → `2inch cut` = **Enable** (event strip 2x6x2) atau **Disable** (event 4R) → OK → Apply → OK. Ubah nilainya benar-benar (bukan hanya OK), dan jangan menulis setelan printer dari skrip: setelan dari program membuat dialog menampilkan nilai yang tidak dipakai driver.
- **Kalibrasi posisi** (`--print-offset "x,y"`, 1/100 in, koordinat halaman (6x4) melebar; y = sumbu kiri-kanan strip karena gambar diputar 90°). Default tanpa flag = tengah (`7.335,6.665`). Nilai laptop booth Rama: `7.335,6.70`.
  1. Cetak target kalibrasi (pita abu 0–4,5 mm, garis hitam 5 mm & merah 10 mm dari tepi gambar, garis biru putus di tengah) sebagai 2x6x2 dengan potong 2 inci aktif; beri kode besar per lembar (K1, K2, …) supaya mudah dilacak.
  2. Baca: garis biru jatuh di potongan kiri → naikkan y; di potongan kanan → turunkan y. Pita abu kiri lebih sempit → naikkan y. 1/100 in = 0,254 mm; di bawah ±0,1 mm sudah batas ketelitian printer.
  3. Set `--print-offset` di config booth; ulangi 1 lembar untuk verifikasi.

## 5. Perintah umum

```powershell
pnpm install --frozen-lockfile
pnpm lint; pnpm typecheck; pnpm test
dotnet test services/camera
# Camera Service: sejak M3 booth menjalankan & mengawasi Camera Service sendiri (port/token acak).
# Cukup pastikan binary dev ter-build (dicari di services/camera/TetraCamera.Host/bin/Debug/net10.0):
dotnet build services/camera
# Booth (build lalu jalankan dengan log konsol ke file)
pnpm --filter booth build
Start-Process apps\booth\node_modules\electron\dist\electron.exe -ArgumentList 'apps\booth','--enable-logging' -RedirectStandardError "$W\logs\electron.log"
```

`env.ps1` menghapus `ELECTRON_RUN_AS_NODE`. Tanpa itu Electron jalan sebagai Node biasa.

Menjalankan sesi booth untuk uji (sejak M1):

```powershell
electron.exe apps\booth --camera=simulated --demo --data="$W\data" --shots="$W\shots\<nama-uji>" --enable-logging
```

- `--camera=webcam|simulated|hotfolder` (hot folder butuh `--hot-folder <dir>`, M7), `--demo` (sesi jalan sendiri), `--size=WxH` (mis. `450x800` untuk portrait di layar 1280×800 logis).
- Kiosk (M5): mati di mode dev, **aktif otomatis di app hasil build** (`app\\booth\\Tetra Booth.exe`); `--kiosk` / `--no-kiosk` untuk memaksa. Di kiosk, keluar hanya lewat mode crew.
- Camera Service di-spawn booth. `--no-spawn` = pakai Camera Service yang dijalankan manual (port 8765, token `dev`). Printer diteruskan: `--printer "Microsoft Print to PDF" --paper-2x6x2 A5 --print-to-file "$W\prints"` (tanpa `--print-to-file`, Print to PDF ditolak `output_file_required`).
- `--data` **wajib** di laptop ini: foto & data sesi masuk `$W\data`, bukan `%APPDATA%`.
- `--shots` menyimpan screenshot **isi jendela booth** per fase (`capturePage`, hanya konten app). Ini cara utama melihat UI.
- Log: `[boot]`, `[session] <fase> <id>`, `[phase]`, `[session] compose <ms> ms`, `[session] selesai <id>: <n> aset`. Semua juga tertulis ke `$W\data\logs\YYYY-MM-DD.log` (sejak M2).
- Jalankan dengan path folder `apps\booth` (bukan `out\main\index.js`) supaya versi app terbaca dari package.json.
- DB lokal: `$W\data\db.sqlite` (`node:sqlite`, WAL).
- Foto webcam merekam ruangan: lihat seperlunya, hapus `$W\data` dan `$W\shots` setelah laporan ditulis.

Kalau butuh screenshot di luar booth, gunakan **jendela aplikasi saja**:
- Cari handle jendela dari proses booth (`(Get-Process 'Tetra Booth','electron').MainWindowHandle`, pilih yang bukan 0).
- Proses PowerShell harus DPI-aware (`SetProcessDPIAware` via P/Invoke `user32.dll`), karena laptop ini scaling 150%. Tanpa itu gambar terpotong.
- Ambil ukuran dengan `GetWindowRect`, lalu `PrintWindow(hwnd, hdc, 2)` (`PW_RENDERFULLCONTENT`) ke `System.Drawing.Bitmap`. Jangan `CopyFromScreen`.
- Simpan ke `$W\shots\`, perkecil, lihat dengan Read, hapus setelahnya. Skripnya simpan lokal di `$W`, jangan di-commit.
- Baca log UTF-8 dengan `Get-Content -Encoding UTF8`.

Menghentikan: `Get-Process 'Tetra Booth',electron,TetraCamera,dotnet -ErrorAction SilentlyContinue | Stop-Process`. Menutup booth normal ikut menghentikan Camera Service.

## 6. Menjaga laptop tetap menyala

`$W\keep-awake.ps1` (dibuat saat bootstrap) memanggil `SetThreadExecutionState` agar Windows tidak sleep selama proses itu hidup. Tidak mengubah setelan. Cek masih jalan di awal sesi; kalau tidak, jalankan lagi (tersembunyi). Menutup layar laptop tetap membuat sleep, jadi pesan ke teman Rama: **jangan tutup laptop, jangan tutup VS Code, biarkan charger tercolok.**

## 7. Bersih-bersih saat laptop dikembalikan

1. Push semua pekerjaan.
2. Hentikan keep-awake, Electron, Camera Service: `Get-Process 'Tetra Booth',electron,TetraCamera,dotnet -ErrorAction SilentlyContinue | Stop-Process -Force`.
3. Hanya saat laptop pinjaman benar-benar tidak dipakai lagi (keputusan Rama): Claude Mac mencabut deploy key `gh repo deploy-key delete 164304172`.
4. **Tampilkan dulu** folder AppData yang dibuat/berubah sejak bootstrap (2026-09-24), supaya milik pemilik laptop tidak ikut terhapus:
   ```powershell
   Get-ChildItem $env:LOCALAPPDATA, $env:APPDATA -Directory | Where-Object LastWriteTime -ge '2026-09-24' | Select-Object FullName, LastWriteTime
   ```
   Hapus hanya yang jelas milik kita (tulis daftarnya di chat untuk Rama sebelum menghapus):

   | Folder | Asal |
   |---|---|
   | `%LOCALAPPDATA%\pnpm`, `%LOCALAPPDATA%\pnpm-cache`, `%LOCALAPPDATA%\pnpm-state` | store & cache pnpm 12 (±1 GB) sebelum `pnpm_config_*` |
   | `%LOCALAPPDATA%\NuGet`, `%APPDATA%\NuGet` | cache HTTP & `NuGet.Config` |
   | `%LOCALAPPDATA%\electron`, `%LOCALAPPDATA%\electron-builder` | zip Electron & tool electron-builder |
   | `%APPDATA%\turborepo`, `%LOCALAPPDATA%\turborepo` | konfigurasi/telemetri turbo |
   | `%LOCALAPPDATA%\biome`, folder `vitest` di AppData | cache tool, kalau ada |
   | `%APPDATA%\TetraBooth`, `%APPDATA%\booth`, `%APPDATA%\Tetra Booth` | data booth kalau pernah jalan tanpa `--data` |
   | `%TEMP%\tb-*`, `%TEMP%\tetra-*` | sisa e2e/test sebelum TEMP diarahkan ke `$W\tmp` |
   | `%USERPROFILE%\.nuget`, `%USERPROFILE%\.dotnet` | kalau ada (sebelum `NUGET_PACKAGES`/`DOTNET_CLI_HOME`) |
5. Hapus `$W` seluruhnya.
6. Rama logout Claude Code di VS Code. Kalau VS Code/extension dipasang khusus untuk ini, uninstall lewat Settings > Apps.

Untuk laptop Windows milik sendiri (bukan pinjaman), pakai `tools/windows/setup-windows-dev.ps1` (install permanen via winget).
