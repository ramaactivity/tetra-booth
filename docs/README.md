# Tetra Booth — Dokumentasi Produk & Teknis

Platform photobooth end-to-end milik Tetra Photobooth: aplikasi booth di Windows (kamera DSLR/mirrorless + printer dye-sub), cloud untuk sync & galeri, halaman tamu, galeri klien, live slideshow, dan dashboard admin. Menggantikan LumaBooth (dslrBooth). Internal dulu, disiapkan untuk jadi SaaS.

## Urutan baca

| # | Dokumen | Isi |
|---|---|---|
| 1 | [01-PRD.md](01-PRD.md) | Apa & kenapa: masalah, tujuan, aktor, mode, metrik |
| 2 | [02-FSD.md](02-FSD.md) | Perilaku tiap layar & aturan bisnis |
| 3 | [03-TSD.md](03-TSD.md) | Detail teknis: protokol, sync, API, keamanan |
| 4 | [04-STACK.md](04-STACK.md) | Pilihan teknologi + alasannya |
| 5 | [05-ARCHITECTURE.md](05-ARCHITECTURE.md) | Diagram sistem, struktur repo, alur data |
| 6 | [06-DATA-MODEL.md](06-DATA-MODEL.md) | Skema Postgres, SQLite lokal, struktur R2 |
| 7 | [07-ROADMAP.md](07-ROADMAP.md) | Fase 0–8 + kriteria selesai |
| 8 | [08-DESIGN.md](08-DESIGN.md) | Arah visual & UX booth + halaman tamu |

Aturan kerja untuk Claude Code ada di `/CLAUDE.md` (root repo).

## Keputusan yang sudah dikunci

| Area | Keputusan |
|---|---|
| Codebase | Mulai repo baru (monorepo). Komponen UI lama di-port seperlunya. |
| Platform | **Windows dimatangkan dulu (Fase 1–5).** macOS di Fase 6. Android + iPad + Air Station di Fase 7. SaaS di Fase 8. UI booth ditulis sekali (`packages/booth-core`) dan tidak bergantung ke Electron. |
| Air Station | Stasiun cetak di laptop yang menerima job print via Wi-Fi lokal dari booth HP/tablet (konsep seperti LemonStation). |
| Desain booth & tamu | Minimalis clean ala Photo Place, warna aksen & logo mengikuti branding event. Tetra Party tidak dipakai di layar yang dilihat tamu. |
| Booth UI | Electron + React + TypeScript + Tailwind + Zustand |
| Kamera & print | Tetra Camera Service (C# .NET 10, console app lintas platform) — Canon EDSDK, Sony Camera Remote SDK (Fase 5), print DNP lewat adapter per OS. Menggantikan digiCamControl. |
| Komunikasi booth | WebSocket localhost antara Electron ↔ Camera Service |
| Mode | `event` (layout fix, gratis untuk tamu) & `photobox` (tamu pilih layout, bayar QRIS). Satu tabel `events` dengan field `mode`. |
| Retake | Per foto, batas diatur per event (default 1x) |
| Cetak | Tamu pilih jumlah, ada batas per event. Photobox: lembar tambahan berbayar. |
| Pembayaran | QRIS saja via Xendit. Modul pembayaran dibuat pluggable. Kit photobox wajib bawa modem 4G. |
| Offline | Booth jalan 100% offline. Internet hanya untuk sync, galeri, dan QRIS. |
| Upload | Strip resolusi cetak + original versi web (2400px) + thumbnail. Full-res tetap di laptop. |
| Storage | Cloudflare R2 (tanpa biaya egress) |
| Retensi | Link tamu 30 hari, galeri klien 90 hari (file dihapus di hari 90). Photobox: 30 hari. Diatur database + cron, lifecycle bucket 400 hari sebagai pengaman. |
| Backend | Next.js di Vercel + Supabase (Postgres, Auth, RLS) |
| Multi-tenant | `organization_id` di semua tabel sejak hari pertama |
| Tetra Ops | Aplikasi terpisah, integrasi via API nanti |
| Link tamu | `/s/{id}` — ID acak 10 karakter (tidak bisa ditebak) |
| Akses klien | Link saja tanpa login/PIN. Token 32 karakter, bisa dicabut & dibuat ulang. Export data lead hanya dari admin. |
| Galeri event publik | Opsional per event, default mati |
| Lead capture | Opsional per event, default mati |
| Template | Overlay PNG + slot (desain di Figma/Photoshop) |
| Orientasi layar | Per event: landscape atau portrait |
| Domain | `tetraphoto.com` (milik owner). Default env: `app.` untuk web, `media.` untuk R2, `zip.` untuk Worker. Semua via env var. Custom domain R2 menunggu DNS pindah ke Cloudflare (DECISIONS #8). |
