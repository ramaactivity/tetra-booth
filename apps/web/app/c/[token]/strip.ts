import type { LayoutSpec } from "@tetra/shared";
import {
  browserContext,
  cpuCanvas,
  type ImageLike,
  renderPiece,
  withQr,
} from "@tetra/template-engine";

const FONT = "Geist Variable";
/** Atur foto di slot (#247): zoom ≥ 1 (1 = penuh menutup slot), geser x/y −1…1 dari tengah. */
export type Crop = { z: number; x: number; y: number };

/**
 * Potong foto ke rasio slot sesuai `crop`, supaya template engine (fit cover) memakai potongan itu apa adanya.
 * Tanpa crop = foto asli (perilaku lama).
 */
export function cropFor(img: ImageBitmap, slotW: number, slotH: number, crop?: Crop): ImageLike {
  if (!crop) return img as unknown as ImageLike;
  const a = slotW / slotH;
  const { width: W, height: H } = img;
  const cw = Math.min(W, H * a) / crop.z;
  const ch = cw / a;
  const cx = W / 2 + (crop.x * (W - cw)) / 2;
  const cy = H / 2 + (crop.y * (H - ch)) / 2;
  const c = cpuCanvas(Math.max(1, Math.round(cw)), Math.max(1, Math.round(ch)));
  c.getContext("2d")?.drawImage(img, cx - cw / 2, cy - ch / 2, cw, ch, 0, 0, c.width, c.height);
  return c as unknown as ImageLike;
}

export type GuestDesign = {
  layout: LayoutSpec;
  assets: Record<string, string>;
  fonts: Record<string, string>;
};

const bitmaps = new Map<string, Promise<ImageBitmap | null>>();
/**
 * Gambar dari URL, di-cache per URL (pratinjau dirender ulang tiap pilihan berubah). Gagal (sinyal venue, memori
 * iPhone) TIDAK di-cache, supaya render berikutnya mencoba lagi; dulu gagal sekali = slot kosong selamanya (#247).
 */
const bitmap = (url: string) => {
  let p = bitmaps.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then(createImageBitmap)
      .catch(() => {
        bitmaps.delete(url);
        return null;
      });
    bitmaps.set(url, p);
  }
  return p;
};
/** Kandidat pertama yang berhasil dimuat (mis. foto penuh lalu thumbnail sebagai cadangan). */
const first = async (urls: string | readonly string[] | null | undefined) => {
  for (const u of typeof urls === "string" ? [urls] : (urls ?? [])) {
    const b = (await bitmap(u)) ?? (await bitmap(u));
    if (b) return b;
  }
  return null;
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
  /** Per slot: URL atau daftar kandidat (dicoba berurutan); kosong = slot belum terisi. */
  photoUrls: (string | readonly string[] | null)[],
  vars: { event_name: string; date: string },
  qrUrl: string,
  scale = 1,
  crops: (Crop | undefined)[] = [],
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
      const b = await first(photoUrls[i]);
      return b ? cropFor(b, s.w, s.h, crops[i]) : blank(s.w, s.h);
    }),
  );
  // Desain booth dengan QR contoh di PNG → QR Snapbook acara di posisi itu (#247); frame tanpa QR tetap tanpa QR.
  const ovId = d.layout.overlay?.assetId;
  const layout = withQr(d.layout, ovId ? assets[ovId] : undefined, browserContext(), false);
  const piece = renderPiece(
    layout,
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
