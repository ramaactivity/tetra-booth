# Rencana Fase 5: Ekspansi

Status: **dikerjakan sejak 2026-09-25** (Mac, Rama AFK dan mendelegasikan keputusan). Fase 4 masih menunggu kunci Xendit dan uji lapangan.

## Milestone (Mac, web)
| # | Isi | Uji |
|---|---|---|
| L1 | **Lead capture** (FSD §2, desain B4): admin E3 atur on/off, mode `gate`/`optional`, field (nama, WhatsApp, email), teks persetujuan. Halaman tamu: bottom sheet di atas foto ter-blur; mode gate tidak mengirim URL foto sebelum lead masuk. `POST /api/s/{id}/lead` (rate limit, consent wajib + versi teks). Export CSV dari dashboard event (owner/admin) + audit log `lead.export`. Lead ikut dihapus saat purge. | e2e tamu (gate & optional) + export |
| L2 | **Galeri publik** (FSD §3, desain C4): toggle dari galeri klien (sheet Pengaturan: toggle, salin link, tanggal hapus). Tamu membuka `/s/{id}/galeri` dari halaman fotonya (read-only: tanpa favorit, ZIP, pengaturan). | e2e toggle → link muncul → galeri read-only |
| L3 | **Animasi di galeri**: GIF sesi (DECISIONS #62) tampil di galeri klien & publik, filter "Animasi". | e2e |

## Ditunda (butuh Windows / hardware / keputusan Rama)
- **Sony a7III (Camera Remote SDK):** SDK + kamera + laptop Windows; laptop sedang dibawa crew.
- **Temukan Foto Saya:** model diputuskan (DECISIONS #76: YuNet + SFace, dijalankan di booth renderer dan browser tamu, bukan Camera Service). Menunggu foto event nyata untuk kalibrasi ambang + uji performa di laptop booth. Urutan kerja: L4a migrasi pgvector + endpoint embedding booth, L4b hitung embedding di booth setelah sesi, L4c halaman C5 (consent → selfie → hasil) + e2e dengan foto fixture.
- **Boomerang / video live view:** butuh burst dari kamera asli (EDSDK Fase 1b).
