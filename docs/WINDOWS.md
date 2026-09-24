# Runbook: Claude Code di laptop Windows

Dibaca oleh Claude Code yang berjalan di laptop Windows. Rama (pemilik proyek) memantau lewat Remote Control dari claude.ai dan **tidak berada di depan laptop**. Laptop ini pinjaman dari teman Rama yang tidak paham teknis.

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

## 3. Prefix setiap perintah PowerShell

Execution policy default Windows memblokir script, dan env tidak bertahan antar perintah. Awali **setiap** perintah dengan:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force; . "$HOME\TetraBooth\env.ps1"; <perintah>
```

`-Scope Process` hanya berlaku untuk proses itu, tidak mengubah setelan.

## 4. Protokol sinkron (git)

- Mac bekerja di `main`. **Windows hanya bekerja di branch `win`.** Jangan push ke `main`, jangan force-push, jangan rewrite history.
- **Awal sesi:** `git fetch origin` → `git checkout win` → `git merge origin/main` (selesaikan konflik; kalau ragu, tanya). Lalu baca `docs/HANDOFF.md`.
- **Kerja:** ambil tugas teratas yang belum dicentang di bagian "Untuk Windows". Commit kecil, pesan konvensional (`fix(camera): ...`, `test(win): ...`).
- **Akhir tugas:** tulis laporan `docs/reports/windows/YYYY-MM-DD-<topik>.md` (apa yang diuji, hasil, angka, error persis, file diubah), centang tugas di HANDOFF, tambahkan satu baris di "Log", commit, `git push origin win`. CI berjalan otomatis untuk branch `win`.
- Butuh sesuatu dari Mac (bug di kode lintas platform, keputusan desain) → tulis di bagian "Untuk Mac" di HANDOFF.
- Mac membaca laporan, lalu merge `win` ke `main`.
- Keputusan teknis baru atau penyimpangan dari dokumen → catat di `docs/DECISIONS.md` (aturan `CLAUDE.md`).

## 5. Perintah umum

```powershell
pnpm install --frozen-lockfile
pnpm lint; pnpm typecheck; pnpm test
dotnet test services/camera
# Camera Service (jendela terpisah, biarkan jalan)
Start-Process -WindowStyle Minimized dotnet -ArgumentList 'run','--project','services/camera/TetraCamera.Host','--','--port','8765','--token','dev'
# Booth (build lalu jalankan dengan log konsol ke file)
pnpm --filter booth build
Start-Process apps\booth\node_modules\electron\dist\electron.exe -ArgumentList 'apps\booth\out\main\index.js','--enable-logging' -RedirectStandardError "$W\logs\electron.log"
```

`env.ps1` menghapus `ELECTRON_RUN_AS_NODE`. Tanpa itu Electron jalan sebagai Node biasa.

Menjalankan sesi booth untuk uji (sejak M1):

```powershell
electron.exe apps\booth\out\main\index.js --camera=simulated --demo --data="$W\data" --shots="$W\shots\<nama-uji>" --enable-logging
```

- `--camera=webcam|simulated`, `--demo` (sesi jalan sendiri), `--size=WxH` (mis. `450x800` untuk portrait di layar 1280×800 logis).
- `--data` **wajib** di laptop ini: foto & data sesi masuk `$W\data`, bukan `%APPDATA%`.
- `--shots` menyimpan screenshot **isi jendela booth** per fase (`capturePage`, hanya konten app). Ini cara utama melihat UI.
- Log: `[boot]`, `[session] <fase> <id>`, `[phase]`, `[session] compose <ms> ms`.
- Foto webcam merekam ruangan: lihat seperlunya, hapus `$W\data` dan `$W\shots` setelah laporan ditulis.

Kalau butuh screenshot di luar booth, gunakan **jendela aplikasi saja**:
- Cari handle jendela dari proses booth (`(Get-Process 'Tetra Booth','electron').MainWindowHandle`, pilih yang bukan 0).
- Proses PowerShell harus DPI-aware (`SetProcessDPIAware` via P/Invoke `user32.dll`), karena laptop ini scaling 150%. Tanpa itu gambar terpotong.
- Ambil ukuran dengan `GetWindowRect`, lalu `PrintWindow(hwnd, hdc, 2)` (`PW_RENDERFULLCONTENT`) ke `System.Drawing.Bitmap`. Jangan `CopyFromScreen`.
- Simpan ke `$W\shots\`, perkecil, lihat dengan Read, hapus setelahnya. Skripnya simpan lokal di `$W`, jangan di-commit.
- Baca log UTF-8 dengan `Get-Content -Encoding UTF8`.

Menghentikan: `Get-Process electron,TetraCamera,dotnet -ErrorAction SilentlyContinue | Stop-Process`.

## 6. Menjaga laptop tetap menyala

`$W\keep-awake.ps1` (dibuat saat bootstrap) memanggil `SetThreadExecutionState` agar Windows tidak sleep selama proses itu hidup. Tidak mengubah setelan. Cek masih jalan di awal sesi; kalau tidak, jalankan lagi (tersembunyi). Menutup layar laptop tetap membuat sleep, jadi pesan ke teman Rama: **jangan tutup laptop, jangan tutup VS Code, biarkan charger tercolok.**

## 7. Bersih-bersih saat laptop dikembalikan

1. Push semua pekerjaan.
2. Hentikan keep-awake, Electron, Camera Service.
3. Minta Rama mencabut deploy key (Claude Mac: `gh repo deploy-key delete <id>`).
4. Hapus `$W` seluruhnya.
5. Rama logout Claude Code di VS Code. Kalau VS Code/extension dipasang khusus untuk ini, uninstall lewat Settings > Apps.

Untuk laptop Windows milik sendiri (bukan pinjaman), pakai `tools/windows/setup-windows-dev.ps1` (install permanen via winget).
