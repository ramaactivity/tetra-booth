# @tetra/editor

Editor template gaya Canva (desain v2 E4) yang dipakai admin web dan booth (DECISIONS #128). Paket ini hanya
React + browser API (Canvas, OffscreenCanvas, FontFace, `createImageBitmap`, `localStorage`); tidak ada Next,
Node, atau Electron. Render pratinjau lewat `@tetra/template-engine` (satu engine, aturan 2).

Semua yang bergantung host (simpan, aset, navigasi, tombol cetak) disuntik lewat props. Undo/redo, snap,
QR (#126), layer, tata letak cepat, "Tata letak saya" (#129), unggah overlay/latar/font, shortcut keyboard, dan
peringatan `beforeunload` ada di dalam paket.

## Pemakaian

```tsx
import { TemplateEditor } from "@tetra/editor";

<TemplateEditor
  initial={layout}               // LayoutSpec versi yang dibuka
  name="Captain Barbershop"
  version={3}
  savedAt="2026-09-30T08:00:00Z" // ISO, untuk label "v3 · tersimpan 15.00"
  files={{ ov: "ov.png", f1: "f1.ttf", "lib-fraunces-600-normal": "lib-fraunces-600-normal.woff2" }}
  presets={savedPresets}         // SavedPreset[] (dari @tetra/shared)
  assetUrl={(assetId) => url}    // gambar/font aset versi ini
  fontUrl={(font) => url}        // woff2 font pustaka (LibFont.file)
  onSave={async ({ layout, name, pendingFiles }) => ({ ok: true, version: 4, message: "Tersimpan" })}
  onSavePreset={async (input) => ({ ok: true, preset: { ...input, ...input.canvas, id: "…" } })}
  onDeletePreset={async (id) => true}
  onBack={() => …}
  actions={({ layout, images, fontFamily }) => <MyPrintButton … />} // opsional
/>
```

## Kontrak props (`TemplateEditorProps`)

| Prop | Tipe | Catatan |
| --- | --- | --- |
| `initial` | `LayoutSpec` | Dibaca sekali saat mount (jadi keadaan awal undo). Ganti template = remount (`key`). |
| `name`, `version`, `savedAt` | `string`, `number`, `string` (ISO) | Nilai awal header. Setelah `onSave` ok, editor memakai `version` dari hasil. |
| `files` | `Record<string, string>` | assetId → nama file. `*.png/jpg/jpeg` dimuat sebagai gambar; selain itu font (kecuali `lib-*`, dimuat dari `fontUrl`). Nama font unggahan (`f1..f4`) tampil di panel. |
| `presets` | `SavedPreset[]` | Nilai awal "Tata letak saya"; editor menyaring yang kertas + ukuran kanvasnya sama. |
| `assetUrl` | `(assetId) => string` | URL yang bisa di-`fetch` / dipakai `FontFace`. |
| `fontUrl` | `(font: LibFont) => string` | URL woff2 untuk setiap `LIB_FONTS`. |
| `onSave` | `(SaveInput) => Promise<SaveResult>` | `layout` = LayoutSpec lengkap; `pendingFiles` = `Partial<Record<AssetId, File>>` (overlay `ov`, latar `bg`, font `f1..f4`) yang dipilih sejak simpan terakhir. `{ ok: true, version, message }` → tanda "belum disimpan" hilang, pending dikosongkan; `{ ok: false, message }` → bilah merah. `message` tampil di bilah status. Promise yang reject = "Gagal menyimpan, coba lagi". |
| `onSavePreset` | `(NewPresetInput) => Promise<SavePresetResult>` | Hanya slot (`name`, `paper`, `canvas`, `slots`). Hasil ok ditambahkan di atas daftar. |
| `onDeletePreset` | `(id) => Promise<boolean>` | Optimistis; `false`/reject = dikembalikan + pesan. |
| `onBack` | `() => void` | Tombol kembali di kiri atas. Peringatan perubahan belum disimpan hanya lewat `beforeunload`; host yang berpindah layar tanpa unload perlu cek sendiri kalau perlu. |
| `actions` | `(EditorActionsContext) => ReactNode` (opsional) | Tombol tambahan di header, sebelum "Margin aman". Konteks: `layout` sekarang, `images` (ImageLike per assetId), `fontFamily(assetId)`. |

`assetUrl` dan `fontUrl` boleh fungsi inline: dibaca ulang hanya saat objek `files` berganti (bukan tiap render).

Ekspor lain: `LIB_FONTS`, `libFont`, `FONT_PACKS`, `LibFont`, `FontPack` (pustaka font, satu sumber untuk admin &
booth), `GEIST`, `VARS`, `samplePhoto` (untuk tombol tes cetak host yang merender lembar contoh).
Konstanta skema ada di `@tetra/shared`: `SavedPreset`, `FONT_IDS`, `ASSET_IDS`, `AssetId`, `SAFE_MARGIN_PX`.

## Hosting

- **Ukuran:** editor mengisi tinggi `h-dvh`; bungkus dengan kontainer layar penuh (`h-dvh overflow-hidden bg-paper`).
- **CSS:** stylesheet Tailwind v4 host harus mengimpor token + gaya color picker dan memindai kelas paket:
  ```css
  @import "tailwindcss";
  @import "@tetra/ui/tokens.css";
  @import "@tetra/ui/color-picker.css";
  @source "<relatif ke file css>/packages/ui/src";
  @source "<relatif ke file css>/packages/editor/src";
  ```
  Web: `apps/web/app/globals.css` (`../../../packages/...`).
- **Font UI:** Geist Variable (teks bawaan, `GEIST`) dan Plus Jakarta Sans Variable (nomor foto contoh) harus sudah
  dimuat host; `@tetra/ui/tokens.css` sudah mengimpor keduanya (fontsource).
- **Bundler:** paket berupa TS/TSX mentah (`exports: ./src/index.ts`). Next: `transpilePackages` memuat
  `@tetra/editor`; Vite/electron-vite memprosesnya langsung.

## Integrasi booth (Windows)

1. `apps/booth/package.json`: tambah `"@tetra/editor": "workspace:*"`, lalu `pnpm install`.
2. `apps/booth/src/renderer/src/index.css`: tambahkan
   ```css
   @import "@tetra/ui/color-picker.css";
   @source "../../../../../packages/ui/src";
   @source "../../../../../packages/editor/src";
   ```
3. Komponen editor dipasang dari renderer (booth-core boleh mengimpor `@tetra/editor`; paket ini tanpa Electron/Node,
   aturan 9). Semua I/O lewat `BoothPlatform`.
4. **Offline:** `assetUrl` menunjuk file bundle event lokal (mis. `blob:` URL dari byte yang dibaca lewat `BoothPlatform`). `fontUrl` harus menunjuk salinan lokal **semua** woff2 pustaka: saat ini file ada di
   `apps/web/public/fonts/` (bundle event hanya berisi font yang dipakai), jadi booth perlu menyalinnya ke aset
   renderer/extraResources.
5. **Simpan (#128):** `onSave` di booth = override lokal per event (seperti #100, "Kembalikan ke cloud"). Tulis
   `layout` + `pendingFiles` ke penyimpanan lokal event, balas `{ ok: true, version, message }` (mis. versi lokal +
   pesan "Tersimpan di booth ini"). Kirim ke cloud (`PUT /api/booth/templates/:id`) menyusul.
6. `onSavePreset`/`onDeletePreset`: booth offline boleh menyimpan lokal atau mengembalikan
   `{ ok: false, message }` / `false`; `presets` boleh `[]`.
7. `actions`: tes cetak booth lewat printer booth (platform), atau kosongkan. Tombol admin (dialog cetak browser +
   bantuan Printing Preferences DNP) tetap di `apps/web/app/admin/(editor)/templates/[id]/PrintButtons.tsx`.
8. Layar sentuh: interaksi kanvas memakai pointer events; tetap uji geser/resize/putar dengan jari (catatan #128).
