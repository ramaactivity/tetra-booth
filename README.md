# Tetra Booth

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

## Struktur

Lihat [`docs/05-ARCHITECTURE.md`](docs/05-ARCHITECTURE.md) §2. Proyek yang belum dibuat (Sony, HotFolder, Cups, booth-mobile, workers/zip) menyusul di fasenya.
