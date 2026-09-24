# Tetra Booth

Repo: `github.com/ramaactivity/tetra-booth` (privat). CI: GitHub Actions (`.github/workflows/ci.yml`), job TS di Ubuntu dan Camera Service di Windows.

Platform photobooth Tetra Photobooth: booth Windows (Electron + Camera Service .NET), cloud (Next.js + Supabase + R2), halaman tamu, galeri klien, admin. Dokumen produk & teknis: [`docs/`](docs/README.md). Aturan kerja: [`CLAUDE.md`](CLAUDE.md). Keputusan: [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Prasyarat

| Alat | Versi | Windows (PowerShell) | macOS |
|---|---|---|---|
| Node | 24 LTS | `winget install OpenJS.NodeJS.LTS` | `nvm install 24` |
| pnpm | via corepack | `corepack enable pnpm` | `corepack enable pnpm` |
| .NET SDK | 10 | `winget install Microsoft.DotNet.SDK.10` | installer arm64 dari dotnet.microsoft.com, atau `dotnet-install.sh --channel 10.0` |
| Git | terbaru | `winget install Git.Git` | bawaan Xcode CLT |
| Supabase CLI | devDependency | `pnpm supabase ...` | `pnpm supabase ...` |

Windows: kalau `pnpm install` gagal membangun modul native, pasang Visual Studio Build Tools (workload "Desktop development with C++").

## Menjalankan

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test        # TS (termasuk uji migrasi + RLS di Postgres sementara)
dotnet test services/camera                      # C#

dotnet run --project services/camera/TetraCamera.Host   # terminal 1: ws://127.0.0.1:8765/ws?token=dev
pnpm dev --filter booth                                 # terminal 2: Electron
pnpm dev --filter web                                   # terminal 3: http://localhost:3000
pnpm --filter web e2e                                   # Playwright: bukti render identik di browser
```

macOS dari terminal editor (VS Code/Cursor): `unset ELECTRON_RUN_AS_NODE` sebelum `pnpm dev --filter booth`.

## Environment

Dua file, keduanya di-gitignore (contoh di `.env.example`):

- `apps/web/.env.local`: URL + publishable key + secret key Supabase, kredensial R2, `NEXT_PUBLIC_*`.
- `.env.local` (root): `SUPABASE_DB_URL` (pooler session mode, port 5432) untuk migrasi/seed/tipe tanpa `supabase login`.

```bash
pnpm --filter @tetra/db push          # migrasi + RLS ke project dev
pnpm --filter @tetra/db seed          # organisasi Tetra + owner (user Auth harus sudah ada)
pnpm --filter @tetra/db types         # generate tipe
pnpm --filter web r2:check            # uji bucket R2
```

Canon EDSDK: taruh DLL di `services/camera/TetraCamera.Canon/sdk/` (tidak di-commit).

## Uji di laptop Windows (tanpa install apa pun)

Ngoding di macOS, uji di laptop Windows. Laptop hanya butuh internet, `curl` dan `tar` bawaan Windows 10/11.

1. Sekali saja di laptop: buat folder, mis. `C:\TetraBooth`, unduh `update.cmd` dari `<NEXT_PUBLIC_MEDIA_URL>/dev-builds/update.cmd` ke folder itu.
2. Di Mac, setiap ada perubahan: `pnpm dist:dev`. Ini membangun Electron win-x64 + Camera Service self-contained, mem-zip, dan upload ke R2 (`dev-builds/tetra-booth-dev.zip`).
3. Di laptop: dobel klik `update.cmd`. Build terbaru diunduh, diekstrak ke `app\`, Camera Service dan booth langsung jalan. Versi build (git sha + waktu) tampil di jendela cmd dan di `app\VERSION.txt`.

`app\run.cmd` menjalankan ulang tanpa unduh. Log Camera Service ada di jendela "Tetra Camera Service" yang diminimalkan.

## Mesin dev Windows (coding + uji hardware)

Untuk ngoding atau menjalankan Claude Code (Remote Control) langsung di laptop Windows. Buka PowerShell biasa (bukan admin), tempel:

```powershell
irm <NEXT_PUBLIC_MEDIA_URL>/dev-builds/setup-windows-dev.ps1 | iex
```

Script (`tools/windows/setup-windows-dev.ps1`) memasang Git, GitHub CLI, VS Code, Node 24, .NET 10, pnpm lewat winget, login GitHub, clone repo ke `%USERPROFILE%\Code\tetra-booth`, `pnpm install`, build Camera Service, pasang extension Claude Code, dan mematikan sleep saat dicolok charger. Aman dijalankan ulang. Sisanya manual: salin dua file `.env.local` dan DLL EDSDK.

Sinkron Mac dan Windows lewat GitHub: pull sebelum mulai, push setelah selesai. Kerja paralel di branch terpisah. Memori Claude per mesin, jadi keputusan wajib dicatat di `docs/DECISIONS.md`.

Script Windows di R2 diperbarui tiap `pnpm dist:dev`, atau tanpa build: `pnpm dist:dev --tools`.

## Struktur

Lihat [`docs/05-ARCHITECTURE.md`](docs/05-ARCHITECTURE.md) §2. Proyek yang belum dibuat (Sony, HotFolder, Cups, booth-mobile, workers/zip) menyusul di fasenya.
