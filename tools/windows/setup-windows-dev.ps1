# Tetra Booth - setup mesin dev Windows, sekali jalan. Aman dijalankan ulang.
# Paling mudah (PowerShell biasa, tidak perlu admin):
#   irm __MEDIA_URL__/dev-builds/setup-windows-dev.ps1 | iex
# Atau dari repo:
#   powershell -ExecutionPolicy Bypass -File tools\windows\setup-windows-dev.ps1
# Hanya ASCII di file ini: PowerShell 5.1 salah membaca UTF-8 tanpa BOM.
param(
  [string]$Dir = "$env:USERPROFILE\Code",
  [string]$Repo = "ramaactivity/tetra-booth"
)
$ErrorActionPreference = "Stop"

function Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Ok($msg) { Write-Host "    OK  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    !!  $msg" -ForegroundColor Yellow }
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function RefreshPath {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}
function WingetInstall($id) {
  Write-Host "    memasang $id (jendela izin Windows bisa muncul, klik Yes)..."
  winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements
  # -1978335189 = sudah terpasang / tidak ada update
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) { throw "winget gagal memasang $id (kode $LASTEXITCODE)" }
  RefreshPath
}

Step "Cek winget"
if (-not (Has winget)) { throw "winget tidak ada. Pasang 'App Installer' dari Microsoft Store, lalu jalankan ulang." }
Ok "winget ada"

Step "Izin script PowerShell untuk user ini (npm/pnpm butuh ini)"
if ((Get-ExecutionPolicy -Scope CurrentUser) -notin @("RemoteSigned", "Unrestricted", "Bypass")) {
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force
}
Ok "ExecutionPolicy CurrentUser: $(Get-ExecutionPolicy -Scope CurrentUser)"

Step "Git, GitHub CLI, VS Code"
if (Has git) { Ok "git sudah ada" } else { WingetInstall "Git.Git"; Ok "git" }
if (Has gh) { Ok "gh sudah ada" } else { WingetInstall "GitHub.cli"; Ok "gh" }
if (Has code) { Ok "VS Code sudah ada" } else { WingetInstall "Microsoft.VisualStudioCode"; Ok "VS Code" }
git config --global core.longpaths true

Step "Node 24 LTS"
if (-not (Has node)) { WingetInstall "OpenJS.NodeJS.LTS" }
$nodeMajor = [int]((node -v).TrimStart("v").Split(".")[0])
if ($nodeMajor -eq 24) { Ok "node $(node -v)" } else { Warn "node $(node -v) terpasang, repo memakai Node 24. Biasanya tetap jalan; kalau error, pasang Node 24." }

Step ".NET 10 SDK"
$sdks = ""
if (Has dotnet) { $sdks = (dotnet --list-sdks) -join "`n" }
if ($sdks -match "(?m)^10\.") { Ok ".NET 10 sudah ada" } else { WingetInstall "Microsoft.DotNet.SDK.10"; Ok ".NET 10" }

Step "Login GitHub (akun ramaactivity)"
# PowerShell 5.1: stderr native + ErrorActionPreference Stop = exception, jadi dilonggarkan sebentar.
$ErrorActionPreference = "Continue"
gh auth status *> $null
$loggedIn = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = "Stop"
if (-not $loggedIn) {
  Write-Host "    Browser akan terbuka. Login dengan akun GitHub ramaactivity, masukkan kode yang tampil di sini."
  gh auth login --hostname github.com --git-protocol https --web
  if ($LASTEXITCODE -ne 0) { throw "login GitHub gagal" }
}
gh auth setup-git
Ok "GitHub siap"
if (-not (git config --global user.email)) {
  $email = Read-Host "    Email untuk commit git (Enter = rama.activity98@gmail.com)"
  if (-not $email) { $email = "rama.activity98@gmail.com" }
  git config --global user.email $email
}
if (-not (git config --global user.name)) { git config --global user.name "ramaactivity" }

Step "Repo $Repo"
$target = Join-Path $Dir "tetra-booth"
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
if (Test-Path (Join-Path $target ".git")) {
  git -C $target pull --ff-only
  if ($LASTEXITCODE -ne 0) { throw "git pull gagal (ada perubahan lokal?). Selesaikan manual di $target" }
  Ok "diperbarui: $target"
} else {
  gh repo clone $Repo $target
  if ($LASTEXITCODE -ne 0) { throw "clone gagal" }
  Ok "di-clone ke $target"
}
Set-Location $target

Step "pnpm + dependensi (beberapa menit di awal)"
$pm = (Get-Content package.json -Raw | ConvertFrom-Json).packageManager
$pnpmVer = $pm.Split("@")[1]
if (-not (Has pnpm) -or ((pnpm -v) -ne $pnpmVer)) {
  npm install -g "pnpm@$pnpmVer"
  RefreshPath
}
Ok "pnpm $(pnpm -v)"
pnpm install
if ($LASTEXITCODE -ne 0) { throw "pnpm install gagal. Kalau errornya soal node-gyp/MSBuild, pasang Visual Studio Build Tools (workload C++), lalu ulangi." }
Ok "dependensi terpasang"

Step "Build Camera Service"
dotnet build services/camera --nologo -v q
if ($LASTEXITCODE -ne 0) { throw "dotnet build gagal" }
Ok "Camera Service ter-build"

Step "Extension Claude Code di VS Code"
code --install-extension anthropic.claude-code --force | Out-Null
Ok "anthropic.claude-code"

Step "Jangan sleep saat dicolok charger (supaya Remote Control tidak putus)"
powercfg /change standby-timeout-ac 0
Ok "sleep saat dicolok: tidak pernah (baterai tidak diubah)"

Write-Host ""
Write-Host "SELESAI. Sisa langkah manual:" -ForegroundColor Green
Write-Host "  1. Salin dari Mac (flashdisk / password manager, jangan lewat chat):"
Write-Host "       tetra-booth\apps\web\.env.local  ->  $target\apps\web\.env.local"
Write-Host "       tetra-booth\.env.local           ->  $target\.env.local"
Write-Host "  2. DLL Canon EDSDK (kalau sudah ada) ke $target\services\camera\TetraCamera.Canon\sdk\"
Write-Host "  3. Buka VS Code:  code `"$target`"   lalu login Claude Code dengan email yang sama seperti di Mac."
Write-Host "  4. Remote Control: di Claude Code ketik /remote-control, lalu pantau dari claude.ai atau HP."
Write-Host "  5. Cek cepat:  pnpm test   dan   dotnet test services/camera"
