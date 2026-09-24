Kamu Claude Code di laptop Windows pinjaman. Aku Rama, pemilik proyek Tetra Booth. Aku memantau lewat Remote Control dari claude.ai dan tidak ada di depan laptop. Laptop ini milik temanku yang tidak paham teknis, jadi jangan minta dia melakukan apa pun selain hal fisik sederhana (misalnya colok kabel), dan instruksinya lewat aku.

Proyek: monorepo privat github.com/ramaactivity/tetra-booth. Koding utama di MacBook-ku oleh Claude lain ("Claude Mac"). Tugasmu di laptop ini: menjalankan dan menguji bagian yang butuh Windows asli, lalu melapor lewat git. Kerjakan sendiri sampai selesai. Berhenti hanya saat aku perlu melakukan sesuatu.

ATURAN LAPTOP PINJAMAN (wajib, berlaku terus):
1. Semua pekerjaan di folder $W = "$HOME\TetraBooth". Jangan membuka atau mengubah file pribadi pemilik laptop.
2. Tidak boleh ada yang butuh admin/UAC (tidak ada yang klik "Yes"). Jangan ubah setelan Windows: power plan, execution policy permanen, PATH/env user atau sistem, registry, startup.
3. Semua tool portable di $W\tools, semua cache di $W. Membersihkan laptop nanti cukup menghapus $W.
4. Tidak ada rahasia di laptop ini (tidak ada .env, key, password). Fase ini tidak membutuhkannya.
5. Setiap perintah PowerShell diawali: Set-ExecutionPolicy -Scope Process Bypass -Force; . "$HOME\TetraBooth\env.ps1";
   (setelah env.ps1 ada; -Scope Process tidak mengubah setelan)

LANGKAH 1: TOOLCHAIN PORTABLE (tanpa admin)
Buat $W, $W\tools, $W\.keys, $W\logs, $W\shots. Unduh dengan Invoke-WebRequest (-UseBasicParsing), ekstrak dengan Expand-Archive:
- Node 24 LTS win-x64 zip: https://nodejs.org/dist/latest-v24.x/ (ambil nama file dari SHASUMS256.txt, verifikasi SHA256) ke $W\tools\node (isi folder langsung, node.exe di $W\tools\node\node.exe).
- .NET SDK 10: jalankan https://dot.net/v1/dotnet-install.ps1 dengan -Channel 10.0 -InstallDir $W\tools\dotnet.
- MinGit 64-bit (zip, bukan busybox) rilis terbaru dari https://api.github.com/repos/git-for-windows/git/releases/latest ke $W\tools\git.
Tulis $W\env.ps1 persis ini:
  $W = "$HOME\TetraBooth"
  $env:Path = "$W\tools\node;$W\tools\dotnet;$W\tools\git\cmd;" + $env:Path
  $env:DOTNET_ROOT = "$W\tools\dotnet"; $env:DOTNET_CLI_HOME = $W
  $env:DOTNET_CLI_TELEMETRY_OPTOUT = "1"; $env:DOTNET_NOLOGO = "1"
  $env:NUGET_PACKAGES = "$W\.nuget"
  $env:npm_config_prefix = "$W\tools\node"; $env:npm_config_cache = "$W\.npm-cache"
  $env:npm_config_store_dir = "$W\.pnpm-store"
  $env:electron_config_cache = "$W\.electron-cache"; $env:ELECTRON_BUILDER_CACHE = "$W\.electron-builder-cache"
  $env:PLAYWRIGHT_BROWSERS_PATH = "$W\.playwright"
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Lalu: npm install -g pnpm@12.6.0. Cek: node -v (v24.x), pnpm -v (12.6.0), dotnet --version (10.x), git --version.

Tulis $W\keep-awake.ps1 (mencegah sleep selama proses hidup, tanpa mengubah setelan):
  $k = Add-Type -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);' -Name K -Namespace W -PassThru
  while ($true) { [void]$k::SetThreadExecutionState(0x80000001); Start-Sleep 30 }
Jalankan tersembunyi: Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$W\keep-awake.ps1"

LANGKAH 2: AKSES GITHUB LEWAT DEPLOY KEY (butuh aku sekali)
- Buat kunci ed25519 tanpa passphrase dengan C:\Windows\System32\OpenSSH\ssh-keygen.exe di $W\.keys\deploy, komentar "tetra-windows-deploy". Kalau ssh nanti menolak karena permission file, perbaiki dengan icacls (hanya user ini yang punya akses).
- Tampilkan isi $W\.keys\deploy.pub di chat dalam code block, lalu tulis: "Rama, kirim public key ini ke Claude Mac untuk dipasang sebagai deploy key (write)." BERHENTI dan tunggu aku bilang sudah.
- Setelah aku bilang sudah: uji dengan ssh.exe -i <key> -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=<$W\.keys\known_hosts> -T git@github.com (harus menyebut "ramaactivity/tetra-booth"). Lalu clone git@github.com:ramaactivity/tetra-booth.git ke $W\tetra-booth memakai core.sshCommand dengan opsi yang sama (path pakai garis miring maju, perhatikan kutip kalau ada spasi). Simpan core.sshCommand itu di config lokal repo. Set config lokal repo (bukan global): user.name "ramaactivity", user.email "rama.activity98@gmail.com". Checkout branch win: git checkout -b win origin/win.

LANGKAH 3: IKUTI RUNBOOK
Baca $W\tetra-booth\CLAUDE.md, docs\WINDOWS.md, docs\HANDOFF.md, docs\PLAN-FASE-1.md. Mulai sekarang ikuti docs\WINDOWS.md. Kerjakan semua tugas di bagian "Untuk Windows" di docs\HANDOFF.md berurutan (W-001 sampai W-004). Jangan menulis kode fitur Fase 1 sebelum aku menyetujui PLAN-FASE-1.md.

Setelah W-004 selesai dan ter-push ke branch win, beri aku ringkasan singkat: apa yang lulus, apa yang gagal, dan pesan untuk temanku kalau ada.
