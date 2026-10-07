# Prompt untuk Claude Code: implementasi desain final Photo Stage

> Cara pakai: salin folder `design_handoff_photo_stage/` ke repo `tetra-booth` di `docs/design/photo-stage/`, lalu tempel semua teks di bawah garis sebagai prompt ke Claude Code di root repo.

---

Ganti **UI sementara Photo Stage** dengan desain final di `docs/design/photo-stage/`. Logika yang sudah jalan (S1–S5: `StageRunner`, event `capture.shot`, hot folder, upload `source: "stage"` + `groupName`, TV di layar kedua, cetak 4R #183, LUT `.cube` #184, daftar grup #181) **tidak boleh berubah perilakunya**, kecuali bagian yang ditandai **[baru]** di README.

## Baca dulu (urut)
1. `CLAUDE.md` dan `PRODUCT.md` di root.
2. `docs/design/08-desain*` (sistem desain v2 yang wajib: token, `layered`, `pressable`, aturan copy).
3. `docs/design/photo-stage/README.md`: spesifikasi lengkap per layar, perilaku, state, copy. **Ini sumber kebenaran.**
4. `docs/design/photo-stage/screenshots/*.png`: render tiap layar di ukuran asli. Implementasi dibandingkan dengan PNG ini.
5. File `*.dc.html` (buka di browser bersama `support.js`): nilai inline persis. Kalau README, PNG dan `.dc.html` berbeda, ikuti `.dc.html`, lalu PNG, lalu README.
6. Kode stage yang ada: `packages/booth-core/src/StageRunner.tsx`, `StageTv.tsx`, `stage.ts`, `stageImage.ts`, `apps/booth/src/main/stage.ts`, `stage-tv.ts`, `apps/web/lib/stage-groups.ts`, halaman tamu/galeri/admin terkait di `apps/web`, serta e2e `apps/booth/e2e/stage.spec.ts` dan `apps/web/e2e/photo-stage-web.spec.ts`.

## Aturan
- Semua perubahan tetap di balik `role: "stage"`. Laptop booth, mode event, dan photobox **tidak tersentuh**. Jalankan seluruh tes booth lama di setiap tahap; harus lulus.
- Pakai token di `packages/ui/src/tokens.css` dan komponen `@tetra/ui` / `booth-core/src/ui.tsx` (`Stage`, `Steps`, `QrCode`, `Done`, `Button`). Jangan menulis hex baru di komponen. Pengecualian yang sudah disetujui: abu hangat frame cetak (`#2A2926`, `#6B6862`, `#8A8578`) dan overlay dialog `rgba(29,29,27,.42)`.
- Layar laptop stage dan TV dirender di kanvas 1920×1080 lewat `Stage`, jadi ukuran px dari desain dipakai apa adanya.
- Web: dropdown wajib `apps/web/components/Select.tsx`, jangan `<select>` bawaan.
- Semua copy ke `packages/booth-core/src/copy.ts` (booth/TV) dan file copy web yang ada. Pakai teks persis dari README §Copy.
- Ikon `lucide-react` menggantikan glyph sementara (⇆ ▦ ▶ ✓ ›), posisi dan ukuran sama.
- QR asli lewat `QrCode` (zona tenang putih ≥ 2 modul).
- **Jangan bangun** elemen bertanda "SIMULASI" / "demo" (garis putus-putus abu-abu) di prototipe; itu hanya alat peraga.
- Gerak 100–300 ms, dan harus mati saat `prefers-reduced-motion`.
- Font Cormorant Garamond **hanya** untuk frame cetak 4R (branding acara). Tambahkan lewat fontsource agar jalan offline. Catat keputusan ini di `DECISIONS` (penyimpangan dari "tanpa serif", khusus cetakan).

## Tahapan (satu PR per tahap, urut)
1. **A2 Operator + A3 status** (paling penting): StatusBar bersegmen, banner masalah satu baris (prioritas kamera > jeda > TV > offline), kartu rombongan aktif (foto terbaru besar + 2×2, slot kosong, footer pisah otomatis), PrintButton di strip bawah tiap foto, NextList, Riwayat, bar bawah dengan keycap, toast.
   [baru]: baki "Belum dikelompokkan" untuk foto yang masuk saat jeda (masukkan ke aktif / jadi rombongan baru / sembunyikan); riwayat dengan pilih foto → Pisah n foto (`#nb`) & Sembunyikan / Tampilkan lagi; Esc menutup dialog/baris.
2. **A4 Warna** sebagai dialog (dan dipakai ulang di A1): pembanding sebelum/sesudah dengan garis geser, LUT + error (rusak / > 8 MB), segmented filter, slider −50…50 dari tengah, preset.
3. **A1 Persiapan**: wizard 5 langkah dengan `Steps`. Langkah kamera menampilkan foto tes dari event `capture.shot` pertama. Langkah TV memakai fungsi uji tampil yang ada.
4. **B4–B6 TV**: tata letak 1–5 foto (lihat README §B4 untuk aturan mosaik), kolom QR putih, bar sisa waktu, dua rombongan sebelumnya; idle dengan galeri bergeser dan QR galeri; transisi 250 ms / 160 ms.
5. **C7–C8 HP tamu**: carousel scroll-snap, Simpan semua (Web Share `files`, fallback ZIP), link galeri.
   [baru]: state C7b "foto masih dikirim" (polling/SSE sampai sesi punya foto, tanpa scan ulang).
6. **D9 Galeri klien** desktop + HP: tab Photobooth / Photo Stage, cari, per jam, unduh per rombongan dan semua (ZIP per sumber yang sudah ada).
7. **E10 Admin**: bagian Photo Stage di Pengaturan event: textarea daftar grup, Impor CSV/TXT (kolom pertama, lewati baris kosong & header), deteksi nama ganda + Hapus ganda, catatan "Diisi dari daftar klien di Tetra Ops (n grup)" bila sumbernya Ops, setelan pisah otomatis / lama tampil TV / frame 4R.
8. **Frame 4R bawaan "Lengkung"** di template engine (README §Frame), dipakai saat event tidak punya frame 4R sendiri. Nama, tagline opsional dan tanggal dari bundle event.

## Selesai jika (per tahap)
- Render Playwright di ukuran yang sama (1920×1080 untuk A/B, 1440 untuk D/E, 390@2x untuk C dan D HP) mendekati PNG di `screenshots/`: spacing, ukuran font, border, lapisan, radius. Simpan render baru di `test-results/` dan sebutkan selisih yang disengaja di deskripsi PR.
- E2E stage yang ada diperbarui ke struktur baru dan lulus; tambah kasus untuk perilaku [baru] (baki jeda, pisah/sembunyikan, C7b).
- Tes booth lama lulus tanpa perubahan.
- Keyboard: ⏎ / Spasi / Tab / Esc sesuai README §Interactions; shortcut mati saat dialog terbuka.
- Tidak ada teks di bawah 20 px di TV; target klik operator ≥ 40 px, tombol utama ≥ 92 px.

## Setelah selesai
- Perbarui tabel pemetaan layar di `docs/design/08-desain` dengan layar Photo Stage dan penyimpangan yang disengaja (lihat `Photo Stage - Spesifikasi.dc.html` §7).
- Tandai UI sementara di catatan rilis sebagai diganti.
- Laporkan ke owner: daftar PR, screenshot render vs desain per layar, dan hal yang belum bisa diuji tanpa perangkat asli (printer 4R, HDMI nirkabel, kamera non-Canon via folder pantau).
