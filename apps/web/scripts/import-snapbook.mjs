// Impor Snapbook dari export Claude Design: node scripts/import-snapbook.mjs "<folder export>"
// Frame (#229): PNG latar/overlay → public/snapbook/, layout → lib/snapbook-frames.json (LayoutSpec, aset
// `snap-<id>-bg|overlay`). `{date}` di desain = YYYY-MM-DD, sedangkan booth mengisi {date} dengan tanggal panjang:
// ditulis ulang jadi {date_iso}.
// Kartu QR (#230): tiap <section data-card> template → lib/snapbook-cards.json, sampul majalah + preview (diperkecil
// `sips`, macOS) → public/snapbook/cards/.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const src = process.argv[2];
if (!src) throw new Error("pakai: node scripts/import-snapbook.mjs <folder export>");
const out = fileURLToPath(new URL("../public/snapbook/", import.meta.url));
mkdirSync(out, { recursive: true });
const index = JSON.parse(readFileSync(join(src, "frames/_index.json"), "utf8"));
const frames = index.frames.map((f) => {
  const dir = join(src, f.dir);
  const j = JSON.parse(readFileSync(join(dir, `${f.id}.json`), "utf8"));
  for (const k of ["bg", "overlay"])
    copyFileSync(join(dir, `${f.id}-${k}.png`), join(out, `${f.id}-${k}.png`));
  return {
    id: f.id,
    style: f.style,
    styleName: f.name.split(" — ")[0],
    category: f.category,
    sortOrder: f.sortOrder,
    layout: {
      id: f.id,
      version: 1,
      paper: j.paper,
      canvas: j.canvas,
      background: { color: j.background.color, assetId: `snap-${f.id}-bg` },
      slots: j.slots,
      overlay: { assetId: `snap-${f.id}-overlay` },
      texts: j.texts.map((t) => ({ ...t, value: t.value.replaceAll("{date}", "{date_iso}") })),
    },
  };
});
writeFileSync(
  new URL("../lib/snapbook-frames.json", import.meta.url),
  `${JSON.stringify(frames, null, 2)}\n`,
);
console.log(`${frames.length} frame diimpor`);

const cardsOut = join(out, "cards");
mkdirSync(cardsOut, { recursive: true });
const tpl = readFileSync(join(src, "kartu-qr/kartu-qr-template.html"), "utf8");
const cards = Object.fromEntries(
  [
    ...tpl.matchAll(
      /<section class="card" data-card="([^"]+)"[^>]*>\s*<h2>[\s\S]*?<\/h2>\s*([\s\S]*?)<\/section>/g,
    ),
  ].map(([, id, html]) => [
    id,
    html
      .trim()
      .replaceAll("assets/cover-contoh.jpg", "/snapbook/cards/cover.jpg")
      .replaceAll("{date}", "{date_iso}"),
  ]),
);
writeFileSync(
  new URL("../lib/snapbook-cards.json", import.meta.url),
  `${JSON.stringify(cards, null, 2)}\n`,
);
copyFileSync(join(src, "kartu-qr/assets/cover-contoh.jpg"), join(cardsOut, "cover.jpg"));
for (const id of Object.keys(cards)) {
  const to = join(cardsOut, `${id}.jpg`);
  execFileSync(
    "sips",
    [
      "-Z",
      "720",
      "-s",
      "format",
      "jpeg",
      "-s",
      "formatOptions",
      "82",
      join(src, `kartu-qr/preview/${id}.png`),
      "--out",
      to,
    ],
    { stdio: "ignore" },
  );
}
console.log(`${Object.keys(cards).length} kartu diimpor`);
