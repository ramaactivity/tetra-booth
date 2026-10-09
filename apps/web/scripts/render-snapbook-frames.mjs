// Render ulang latar + overlay frame Snapbook dari sumber desainer (#229/#232):
//   node scripts/render-snapbook-frames.mjs [id ...]   (kosong = semua 45)
// Sumber: docs/design/snapbook/sumber-desain/SnapFrame.dc.html, satu blok `<sc-if value="{{ is_<gaya>_<ukuran> }}">`
// per frame. Elemen sebelum foto pertama = latar (bg.png, termasuk warna akar); elemen setelahnya = overlay (PNG
// transparan, lubang di slot foto). Foto & teks dinamis ({{ eventName }} dst.) tidak dirender: teks dinamis digambar
// template engine dari JSON. Ubah tulisan di sumber, jalankan skrip ini, lalu `import-snapbook` tidak perlu.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const SRC = fileURLToPath(new URL("../../../docs/design/snapbook/sumber-desain/", import.meta.url));
const OUT = fileURLToPath(new URL("../public/snapbook/", import.meta.url));
const html = readFileSync(`${SRC}SnapFrame.dc.html`, "utf8");
const fonts = html.match(/<link rel="stylesheet" href="([^"]+)"/)?.[1];
const blocks = Object.fromEntries(
  [...html.matchAll(/<sc-if value="\{\{ is_([a-z0-9_]+) \}\}"[^>]*>([\s\S]*?)<\/sc-if>/g)].map(
    ([, k, b]) => [k.replace(/_/g, "-"), b.trim()],
  ),
);
const want = process.argv.slice(2);
const ids = want.length ? want : Object.keys(blocks);
const browser = await chromium.launch();
const page = await browser.newPage();
for (const id of ids) {
  const block = blocks[id];
  if (!block) throw new Error(`frame tidak ada di sumber: ${id}`);
  await page.setContent(
    `<!doctype html><html><head><base href="file://${SRC}"><link rel="stylesheet" href="${fonts}">
<style>html,body{margin:0;background:transparent}</style></head><body>${block.replace(/<\/img>/g, "")}</body></html>`,
    { waitUntil: "networkidle" },
  );
  await page.evaluate(() => document.fonts.ready);
  const size = await page.evaluate(() => {
    const root = document.body.firstElementChild;
    const kids = [...root.children];
    const first = kids.findIndex(
      (k) => k.tagName === "IMG" && /foto\//.test(k.getAttribute("src") ?? ""),
    );
    kids.forEach((k, i) => {
      k.dataset.layer = i < first ? "bg" : "over";
      if (k.tagName === "IMG" && /foto\//.test(k.getAttribute("src") ?? ""))
        k.dataset.layer = "photo";
      if (/\{\{/.test(k.textContent ?? "")) k.dataset.layer = "dyn";
    });
    root.dataset.style = root.getAttribute("style") ?? "";
    return { w: root.offsetWidth, h: root.offsetHeight };
  });
  await page.setViewportSize({ width: size.w, height: size.h });
  const shot = async (mode, path) => {
    await page.evaluate((m) => {
      const root = document.body.firstElementChild;
      root.setAttribute("style", root.dataset.style ?? "");
      if (m !== "bg") root.style.background = "transparent";
      for (const k of root.children)
        k.style.visibility = k.dataset.layer === m ? "visible" : "hidden";
    }, mode);
    await page.screenshot({
      path,
      omitBackground: true,
      clip: { x: 0, y: 0, width: size.w, height: size.h },
    });
  };
  await shot("bg", `${OUT}${id}-bg.png`);
  await shot("over", `${OUT}${id}-overlay.png`);
  console.log(id, `${size.w}×${size.h}`);
}
await browser.close();
