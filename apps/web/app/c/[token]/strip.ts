import type { LayoutSpec } from "@tetra/shared";
import { browserContext, cpuCanvas, type ImageLike, renderPiece } from "@tetra/template-engine";

const FONT = "Geist Variable";
export type GuestDesign = {
  layout: LayoutSpec;
  assets: Record<string, string>;
  fonts: Record<string, string>;
};

const bitmaps = new Map<string, Promise<ImageBitmap | null>>();
/** Gambar dari URL, di-cache per URL (pratinjau strip dirender ulang tiap pilihan berubah). */
const bitmap = (url: string) => {
  let p = bitmaps.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then(createImageBitmap)
      .catch(() => null);
    bitmaps.set(url, p);
  }
  return p;
};
const fonts = new Map<string, Promise<string | null>>();
const font = (id: string, url: string) => {
  let p = fonts.get(id);
  if (!p) {
    p = new FontFace(`gc-${id}`, `url(${url})`)
      .load()
      .then((f) => {
        document.fonts.add(f);
        return `gc-${id}`;
      })
      .catch(() => null);
    fonts.set(id, p);
  }
  return p;
};

/** Slot belum terisi: bergaris seperti placeholder foto di UI (desain v2 `stripes`). */
const blank = (w: number, h: number) => {
  const c = cpuCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = "#EFEDE8";
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "#E6E3DD";
    g.lineWidth = Math.max(4, c.width / 20);
    for (let x = -c.height; x < c.width; x += g.lineWidth * 2) {
      g.beginPath();
      g.moveTo(x, c.height);
      g.lineTo(x + c.height, 0);
      g.stroke();
    }
  }
  return c as unknown as ImageLike;
};

/**
 * Strip virtual Guest Cam (#197/#209): foto tamu (sudah berpreset) ke desain utama event lewat template engine
 * yang sama dengan booth (aturan 2). `null` = slot kosong (pratinjau langsung saat memilih). `scale` < 1 untuk
 * pratinjau cepat. Hasil = satu potong desain + thumb 480.
 */
export async function renderStrip(
  d: GuestDesign,
  photoUrls: (string | null)[],
  vars: { event_name: string; date: string },
  qrUrl: string,
  scale = 1,
) {
  const assets: Record<string, ImageLike> = {};
  for (const [id, u] of Object.entries(d.assets)) {
    const img = await bitmap(u);
    if (img) assets[id] = img;
  }
  const family: Record<string, string> = {};
  for (const [id, u] of Object.entries(d.fonts)) {
    const f = await font(id, u);
    if (f) family[id] = f;
  }
  await document.fonts.load(`40px "${FONT}"`).catch(() => {});
  const photos = await Promise.all(
    d.layout.slots.map(async (s, i) => {
      const u = photoUrls[i];
      return (u && (await bitmap(u))) || blank(s.w, s.h);
    }),
  );
  const piece = renderPiece(
    d.layout,
    { photos, assets, vars, qrUrl },
    { ...browserContext(FONT), fontFamily: (id) => family[id] ?? FONT },
    scale,
  ) as unknown as OffscreenCanvas;
  const k = Math.min(1, 480 / Math.max(piece.width, piece.height));
  const t = cpuCanvas(Math.round(piece.width * k), Math.round(piece.height * k));
  t.getContext("2d")?.drawImage(piece, 0, 0, t.width, t.height);
  return {
    main: await piece.convertToBlob({ type: "image/jpeg", quality: 0.88 }),
    thumb: await (t as unknown as OffscreenCanvas).convertToBlob({
      type: "image/jpeg",
      quality: 0.8,
    }),
  };
}
