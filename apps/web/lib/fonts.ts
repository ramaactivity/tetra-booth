/**
 * Pustaka font bawaan editor template (DECISIONS #77). File woff2 (subset latin, OFL) ada di `public/fonts/`;
 * saat template disimpan, font yang dipakai ikut diunggah ke R2 sebagai aset bundle (booth tidak butuh internet).
 * assetId = `lib-<nama file tanpa .woff2>`.
 */
export type FontCategory =
  | "Serif"
  | "Script"
  | "Tulisan tangan"
  | "Sans"
  | "Display"
  | "Ceria"
  | "Mono";
export type LibFont = { id: string; name: string; category: FontCategory; file: string };

const f = (file: string, name: string, category: FontCategory): LibFont => ({
  id: `lib-${file}`,
  name,
  category,
  file: `${file}.woff2`,
});

export const LIB_FONTS: LibFont[] = [
  f("cormorant-garamond-500-normal", "Cormorant Garamond", "Serif"),
  f("cormorant-garamond-600-italic", "Cormorant Garamond Italic", "Serif"),
  f("fraunces-600-normal", "Fraunces", "Serif"),
  f("instrument-serif-400-normal", "Instrument Serif", "Serif"),
  f("instrument-serif-400-italic", "Instrument Serif Italic", "Serif"),
  f("bodoni-moda-500-normal", "Bodoni Moda", "Serif"),
  f("dm-serif-display-400-normal", "DM Serif Display", "Serif"),
  f("pinyon-script-400-normal", "Pinyon Script", "Script"),
  f("monsieur-la-doulaise-400-normal", "Monsieur La Doulaise", "Script"),
  f("mrs-saint-delafield-400-normal", "Mrs Saint Delafield", "Script"),
  f("italianno-400-normal", "Italianno", "Script"),
  f("reenie-beanie-400-normal", "Reenie Beanie", "Tulisan tangan"),
  f("nothing-you-could-do-400-normal", "Nothing You Could Do", "Tulisan tangan"),
  f("plus-jakarta-sans-500-normal", "Plus Jakarta Sans", "Sans"),
  f("plus-jakarta-sans-800-normal", "Plus Jakarta Sans ExtraBold", "Sans"),
  f("figtree-500-normal", "Figtree", "Sans"),
  f("bricolage-grotesque-700-normal", "Bricolage Grotesque Bold", "Display"),
  f("unbounded-600-normal", "Unbounded", "Display"),
  f("syne-700-normal", "Syne Bold", "Display"),
  f("fredoka-600-normal", "Fredoka", "Ceria"),
  f("shrikhand-400-normal", "Shrikhand", "Ceria"),
  f("dm-mono-400-normal", "DM Mono", "Mono"),
];
export const libFont = (id: string) => LIB_FONTS.find((x) => x.id === id);

type PackText = { font: string; size: number; value: string };
/** Paket kombinasi font (judul + keterangan) untuk jenis acara, seperti "font combinations" di Canva. */
export type FontPack = { id: string; name: string; use: string; title: PackText; sub: PackText };
const P = (
  id: string,
  name: string,
  use: string,
  title: [string, number],
  sub: [string, number],
): FontPack => ({
  id,
  name,
  use,
  title: { font: `lib-${title[0]}`, size: title[1], value: "{event_name}" },
  sub: { font: `lib-${sub[0]}`, size: sub[1], value: "{date}" },
});

export const FONT_PACKS: FontPack[] = [
  P(
    "klasik",
    "Klasik",
    "Pernikahan",
    ["pinyon-script-400-normal", 96],
    ["cormorant-garamond-500-normal", 34],
  ),
  P(
    "romantis",
    "Romantis",
    "Pernikahan, lamaran",
    ["monsieur-la-doulaise-400-normal", 104],
    ["fraunces-600-normal", 30],
  ),
  P(
    "editorial",
    "Editorial",
    "Pernikahan modern",
    ["instrument-serif-400-italic", 88],
    ["figtree-500-normal", 28],
  ),
  P(
    "mewah",
    "Mewah",
    "Gala, launching",
    ["bodoni-moda-500-normal", 72],
    ["cormorant-garamond-600-italic", 34],
  ),
  P(
    "modern",
    "Modern",
    "Korporat, gathering",
    ["bricolage-grotesque-700-normal", 72],
    ["plus-jakarta-sans-500-normal", 28],
  ),
  P("tegas", "Tegas", "Konser, festival", ["unbounded-600-normal", 64], ["dm-mono-400-normal", 26]),
  P(
    "ceria",
    "Ceria",
    "Ulang tahun, anak",
    ["shrikhand-400-normal", 80],
    ["fredoka-600-normal", 32],
  ),
  P(
    "personal",
    "Personal",
    "Wisuda, reuni",
    ["reenie-beanie-400-normal", 96],
    ["dm-serif-display-400-normal", 32],
  ),
];
