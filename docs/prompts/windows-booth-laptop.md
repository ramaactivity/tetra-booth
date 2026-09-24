Kamu Claude Code di laptop Windows milikku sendiri (Rama, pemilik proyek Tetra Booth). Aku ada di depan laptop. Di sini terpasang kamera Canon 60D dan printer DNP RX1HS, jadi kita akan menguji booth dengan hardware sungguhan.

Proyek: monorepo privat github.com/ramaactivity/tetra-booth. Koding utama di MacBook-ku oleh Claude lain ("Claude Mac"). Tugasmu di sini: menjalankan dan menguji hal yang butuh Windows dan hardware asli, lalu melapor lewat git. Kerjakan sendiri sampai selesai. Berhenti hanya kalau aku perlu melakukan sesuatu (klik izin Windows, login, tekan shutter, isi kertas) atau memutuskan sesuatu.

LANGKAH 1: TOOL (dipasang permanen)
- Pasang dengan winget (aku akan klik "Yes" kalau Windows minta izin): Git.Git, GitHub.cli, OpenJS.NodeJS.LTS (harus Node 24.x; kalau bukan 24, pasang versi 24 dari nodejs.org), Microsoft.DotNet.SDK.10. Lewati yang sudah terpasang.
- Set-ExecutionPolicy -Scope CurrentUser RemoteSigned (supaya npm/pnpm .ps1 jalan), lalu npm install -g pnpm@12.6.0.
- Setelah memasang tool, segarkan PATH di setiap perintah: $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
- Cek versi: node -v, pnpm -v, dotnet --version, git --version, gh --version.

LANGKAH 2: GITHUB (butuh aku sekali)
- Minta aku membuka jendela PowerShell baru dan menjalankan: gh auth login (pilih GitHub.com, HTTPS, login lewat browser, akun ramaactivity), lalu: gh auth setup-git. BERHENTI dan tunggu aku bilang "sudah".
- Buat folder C:\TetraBooth, lalu: gh repo clone ramaactivity/tetra-booth C:\TetraBooth\tetra-booth. Di repo itu: git config user.name "ramaactivity"; git config user.email "rama.activity98@gmail.com"; git checkout win (branch sudah ada di origin); git merge origin/main.

LANGKAH 3: IKUTI RUNBOOK
Baca C:\TetraBooth\tetra-booth\CLAUDE.md, docs\WINDOWS.md (terutama §0 profil A: laptop booth milikku, aturan laptop pinjaman §2 TIDAK berlaku), docs\HANDOFF.md, docs\PLAN-FASE-1.md, docs\DECISIONS.md. Kerjakan tugas di bagian "Untuk Windows" di HANDOFF.md berurutan mulai W-021. Setiap tugas: laporan di docs\reports\windows\, centang di HANDOFF, commit, git push origin win, cek CI dengan gh run list --branch win. Jangan push ke main.

ATURAN PENTING
- Cetak fisik ke DNP memakai kertas dan ribbon: patuhi jatah lembar di setiap tugas, dan beri tahu aku sebelum mencetak.
- Jangan memasang driver atau software (driver DNP, EOS Utility) tanpa bertanya dulu.
- Tidak ada rahasia yang perlu disimpan di laptop ini untuk tugas-tugas ini.
- Butuh aksi fisik dariku (colok USB, tekan shutter, isi kertas): tulis satu kalimat jelas lalu tunggu.

Setelah semua tugas yang ada selesai, beri aku ringkasan: apa yang lulus, apa yang gagal, jumlah lembar DNP yang terpakai, dan hal yang butuh keputusanku.
