/**
 * Lembar tes cetak (#239): bukan sekadar "tercetak", tapi mengukur kualitas. Satu panel per potongan kertas
 * (4R = 1 panel 1200×1800, strip 2x6x2 = 2 panel 600×1800 dengan garis potong), 300 dpi:
 * - Potongan & posisi: skala 0–5 mm tiap sisi dari tepi kertas (angka pertama yang terlihat = mm terpotong),
 *   garis tepi 0/1/2/3 mm, penggaris mm bawah & kanan, silang + lingkaran tengah, batang skala 50/30 mm.
 * - Warna: RGB/CMY penuh & 50%, warna kulit, abu 0–100%, detail gelap 90–100% & terang 0–10%, gradasi,
 *   abu netral, foto contoh.
 * - Ketajaman: garis 1/2/3 px dan teks 4–10 pt.
 * - Info (kertas, koreksi warna printer aktif, versi, waktu) + cara membaca tercetak di lembar.
 */

/** Konteks 2D minimal (OffscreenCanvas di booth, @napi-rs/canvas untuk uji visual di Mac). */
export type ChartCtx = {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(t: string, x: number, y: number, maxWidth?: number): void;
  measureText(t: string): { width: number };
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a: number, b: number): void;
  stroke(): void;
  save(): void;
  restore(): void;
  setLineDash(d: number[]): void;
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): { addColorStop(o: number, c: string): void };
  drawImage(img: unknown, dx: number, dy: number, dw: number, dh: number): void;
};

export type ChartInfo = {
  paper: string;
  tone: { brightness: number; contrast: number; saturation: number; sharpness?: number };
  version: string;
  when: string;
  font: string;
  mono: string;
};

const MM = 300 / 25.4;
const PT = 300 / 72;
const INK = "#1D1D1B";
const MUTED = "#5F5E5A";
const RINGS = [
  { mm: 0, c: INK },
  { mm: 1, c: "#E5332A" },
  { mm: 2, c: "#13A538" },
  { mm: 3, c: "#1F5FD6" },
];
const SKIN = ["#F4D6C3", "#E9BE9F", "#DCA684", "#C98D67", "#AB7150", "#7E5237"];
const PRIMARY = [
  ["Merah", "#FF0000"],
  ["Hijau", "#00FF00"],
  ["Biru", "#0000FF"],
  ["Cyan", "#00FFFF"],
  ["Magenta", "#FF00FF"],
  ["Kuning", "#FFFF00"],
] as const;
const half = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => Math.round(255 - (255 - Number.parseInt(hex.slice(i, i + 2), 16)) / 2)).join(",")})`;
const gray = (pct: number) => {
  const v = Math.round(255 * (1 - pct / 100));
  return `rgb(${v},${v},${v})`;
};
const PHOTO_RATIO = 421 / 449;

type TextOpt = { c?: string; al?: string; mono?: boolean; weight?: number; w?: number };

/** Satu panel tes (lebar W, tinggi H) di posisi x0. */
function panel(g: ChartCtx, x0: number, W: number, H: number, info: ChartInfo, photo: unknown) {
  const narrow = W < 900;
  const s = narrow ? 0.78 : 1; // skala huruf & tinggi kotak
  const pad = Math.round(10 * MM);
  const inner = W - pad * 2;
  const font = (px: number, weight: number, mono?: boolean) =>
    `${weight} ${Math.round(px)}px "${mono ? info.mono : info.font}", sans-serif`;
  const text = (t: string, x: number, y: number, px: number, o: TextOpt = {}) => {
    g.fillStyle = o.c ?? INK;
    g.font = font(px, o.weight ?? 600, o.mono);
    g.textAlign = o.al ?? "left";
    g.textBaseline = "top";
    g.fillText(t, x, y, o.w);
  };
  /** Paragraf dibungkus per kata ke lebar `w`; kembalikan y setelah baris terakhir. */
  const para = (t: string, x: number, y: number, w: number, px: number, o: TextOpt = {}) => {
    g.font = font(px, o.weight ?? 500, o.mono);
    let line = "";
    let yy = y;
    for (const word of t.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (g.measureText(next).width > w && line) {
        text(line, x, yy, px, o);
        yy += px * 1.3;
        line = word;
      } else line = next;
    }
    if (line) text(line, x, yy, px, o);
    return yy + px * 1.3;
  };

  // ── Kertas, garis tepi, pengukur potongan, penggaris ────────────────────────────────────────
  g.fillStyle = "#FFFFFF";
  g.fillRect(x0, 0, W, H);
  for (const r of RINGS) {
    const i = r.mm * MM;
    g.strokeStyle = r.c;
    g.lineWidth = 2;
    g.strokeRect(x0 + i + 1, i + 1, W - 2 * i - 2, H - 2 * i - 2);
  }
  const gauge = (side: "top" | "bottom" | "left" | "right", at: number) => {
    g.fillStyle = INK;
    for (let k = 1; k <= 10; k++) {
      const d = k * 0.5 * MM;
      const len = k % 2 ? 16 : 30;
      if (side === "top") g.fillRect(at - len / 2, d, len, 2);
      if (side === "bottom") g.fillRect(at - len / 2, H - d - 2, len, 2);
      if (side === "left") g.fillRect(x0 + d, at - len / 2, 2, len);
      if (side === "right") g.fillRect(x0 + W - d - 2, at - len / 2, 2, len);
      if (k % 2) continue;
      // Angka mm berselang kiri/kanan supaya tidak bertumpuk (jarak garis 0,5 mm = 6 px).
      const n = String(k / 2);
      const flip = (k / 2) % 2 === 0;
      const o = { mono: true, weight: 600 } as const;
      if (side === "top")
        text(n, at + (flip ? -30 : 20), d - 8, 15, { ...o, al: flip ? "right" : "left" });
      if (side === "bottom")
        text(n, at + (flip ? -30 : 20), H - d - 9, 15, { ...o, al: flip ? "right" : "left" });
      if (side === "left") text(n, x0 + d, at + (flip ? -42 : 22), 15, { ...o, al: "center" });
      if (side === "right") text(n, x0 + W - d, at + (flip ? -42 : 22), 15, { ...o, al: "center" });
    }
  };
  const gx = x0 + W / 2;
  gauge("top", gx);
  gauge("bottom", gx);
  gauge("left", H / 2);
  gauge("right", H / 2);
  for (const [cx, cy, dx, dy] of [
    [x0 + 5 * MM, 5 * MM, 1, 1],
    [x0 + W - 5 * MM, 5 * MM, -1, 1],
    [x0 + 5 * MM, H - 5 * MM, 1, -1],
    [x0 + W - 5 * MM, H - 5 * MM, -1, -1],
  ] as const) {
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx, cy + dy * 30);
    g.lineTo(cx, cy);
    g.lineTo(cx + dx * 30, cy);
    g.stroke();
  }
  // Penggaris mm: bawah (horizontal) & kanan (vertikal), di zona 4–8 mm dari tepi, angka tiap cm.
  g.fillStyle = MUTED;
  const rulerAt = 8 * MM;
  for (let mm = 0; 10 * MM + mm * MM <= W - 10 * MM; mm++) {
    const x = x0 + 10 * MM + mm * MM;
    if (Math.abs(x - gx) < 40) continue;
    const len = mm % 10 === 0 ? 20 : mm % 5 === 0 ? 13 : 7;
    g.fillRect(x, H - rulerAt, 1.5, len);
    if (mm % 10 === 0)
      text(String(mm / 10), x + 3, H - rulerAt + 6, 12, { mono: true, weight: 500, c: MUTED });
  }
  for (let mm = 0; 12 * MM + mm * MM <= H - 12 * MM; mm++) {
    const y = 12 * MM + mm * MM;
    if (Math.abs(y - H / 2) < 50) continue;
    const len = mm % 10 === 0 ? 20 : mm % 5 === 0 ? 13 : 7;
    g.fillRect(x0 + W - rulerAt - len + 20, y, len, 1.5);
  }

  // ── Judul & info ──────────────────────────────────────────────────────────────────────────────
  let y = 11 * MM;
  text("TES CETAK", x0 + pad, y, 64 * s, { weight: 800 });
  if (!narrow) text("Tetra Booth", x0 + W - pad, y + 24 * s, 24 * s, { al: "right", weight: 700 });
  y += 84 * s;
  const t = info.tone;
  for (const l of [
    `Kertas ${info.paper}`,
    info.when,
    `Koreksi warna: terang ${t.brightness} · kontras ${t.contrast} · saturasi ${t.saturation} · tajam ${t.sharpness ?? 0}`,
    `Booth ${info.version}`,
  ]) {
    y = para(l, x0 + pad, y, inner, 20 * s, { mono: true, weight: 400, c: "#3A3936" });
  }
  // Batang skala: diukur dengan penggaris sungguhan; beda = printer memperkecil/memperbesar gambar.
  const barMm = narrow ? 30 : 50;
  const bar = Math.round(barMm * MM);
  y += 8;
  g.fillStyle = INK;
  g.fillRect(x0 + pad, y + 8, bar, 6);
  g.fillRect(x0 + pad, y, 3, 22);
  g.fillRect(x0 + pad + bar - 3, y, 3, 22);
  const scale = `skala: harus tepat ${barMm} mm`;
  if (narrow) {
    text(scale, x0 + pad, y + 28, 17 * s, { weight: 600 });
    y += 64;
  } else {
    text(scale, x0 + pad + bar + 14, y + 2, 17 * s, { weight: 600 });
    y += 44;
  }

  // ── Kolom: foto (kiri / atas) + kotak warna ────────────────────────────────────────────────────
  type Col = { x: number; w: number };
  const label = (c: Col, l: string) => {
    text(l.toUpperCase(), c.x, y, 18 * s, { mono: true, weight: 500, c: MUTED, w: c.w });
    y += 26 * s;
  };
  const row = (
    c: Col,
    cells: { c: string; t?: string | undefined; tc?: string | undefined }[],
    h: number,
    gap = 14,
  ) => {
    const w = c.w / cells.length;
    cells.forEach((cell, i) => {
      g.fillStyle = cell.c;
      g.fillRect(c.x + i * w, y, Math.ceil(w), h);
      if (cell.t)
        text(cell.t, c.x + i * w + w / 2, y + h - 24 * s, 16 * s, {
          al: "center",
          mono: true,
          weight: 600,
          c: cell.tc ?? INK,
          w: w - 4,
        });
    });
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    g.strokeRect(c.x, y, c.w, h);
    y += h + gap;
  };
  const full: Col = { x: x0 + pad, w: inner };
  const photoW = narrow ? inner : Math.round(inner * 0.47);
  const photoH = Math.round(photoW / PHOTO_RATIO);
  const top = y;
  if (photo) g.drawImage(photo, x0 + pad, y, photoW, photoH);
  g.strokeStyle = INK;
  g.lineWidth = 2;
  g.strokeRect(x0 + pad, y, photoW, photoH);
  const capY = para(
    "Foto: kulit harus natural, tidak kemerahan / kekuningan / pucat.",
    x0 + pad,
    y + photoH + 8,
    photoW,
    16 * s,
    { c: MUTED, weight: 500 },
  );
  const side: Col = narrow ? full : { x: x0 + pad + photoW + 28, w: inner - photoW - 28 };
  y = narrow ? capY + 14 : top;
  const ph = Math.round(70 * s);

  label(side, "Warna dasar · penuh & 50%");
  row(
    side,
    PRIMARY.map(([n, c]) => ({ c, t: n.slice(0, 3), tc: n === "Biru" ? "#FFFFFF" : INK })),
    ph,
    6,
  );
  row(
    side,
    PRIMARY.map(([, c]) => ({ c: half(c) })),
    Math.round(ph * 0.55),
  );
  label(side, "Warna kulit");
  row(
    side,
    SKIN.map((c, i) => ({ c, tc: i > 3 ? "#FFFFFF" : INK, t: String(i + 1) })),
    ph,
  );
  label(side, "Abu-abu 0–100% (tiap kotak beda)");
  row(
    side,
    Array.from({ length: 11 }, (_, i) => ({
      c: gray(i * 10),
      t: i % 2 ? undefined : String(i * 10),
      tc: i > 5 ? "#FFFFFF" : INK,
    })),
    ph,
  );
  y = Math.max(y, narrow ? y : capY + 16);

  label(full, "Detail gelap 90–100% · terang 0–10% (masih terbedakan)");
  const dh = Math.round(56 * s);
  row(
    full,
    [90, 92, 94, 96, 98, 100].map((p) => ({ c: gray(p), t: String(p), tc: "#FFFFFF" })),
    dh,
    6,
  );
  row(
    full,
    [0, 2, 4, 6, 8, 10].map((p) => ({ c: gray(p), t: String(p) })),
    dh,
  );

  label(full, "Gradasi halus (tidak boleh belang)");
  const gh = Math.round(34 * s);
  const bw = g.createLinearGradient(full.x, 0, full.x + full.w, 0);
  bw.addColorStop(0, "#000000");
  bw.addColorStop(1, "#FFFFFF");
  g.fillStyle = bw;
  g.fillRect(full.x, y, full.w, gh);
  y += gh + 6;
  const hue = g.createLinearGradient(full.x, 0, full.x + full.w, 0);
  for (const [i, c] of [
    "#FF0000",
    "#FFFF00",
    "#00FF00",
    "#00FFFF",
    "#0000FF",
    "#FF00FF",
    "#FF0000",
  ].entries())
    hue.addColorStop(i / 6, c);
  g.fillStyle = hue;
  g.fillRect(full.x, y, full.w, gh);
  y += gh + 16;

  label(full, "Abu netral · ketajaman");
  const boxH = Math.round(150 * s);
  const nw = Math.round(inner * (narrow ? 0.4 : 0.3));
  g.fillStyle = gray(50);
  g.fillRect(full.x, y, nw, boxH);
  para("Harus abu murni, tidak kehijauan / kemerahan", full.x + 12, y + 14, nw - 24, 16 * s, {
    c: "#FFFFFF",
    weight: 700,
  });
  const sx = full.x + nw + 16;
  const sw = inner - nw - 16;
  const lpH = Math.round(46 * s);
  [1, 2, 3].forEach((lw, k) => {
    const bx = sx + (k * sw) / 3;
    g.fillStyle = INK;
    for (let x = bx; x < bx + sw / 3 - 8; x += lw * 2) g.fillRect(x, y, lw, lpH);
    text(`${lw}px`, bx + sw / 6 - 4, y + lpH + 3, 14 * s, {
      al: "center",
      mono: true,
      weight: 500,
    });
  });
  let ty = y + lpH + 24 * s;
  for (const pt of narrow ? [4, 6, 8] : [4, 6, 8, 10]) {
    text(`${pt}pt Tetra tajam 0123`, sx, ty, pt * PT, { weight: 500, w: sw });
    ty += pt * PT + 4;
  }
  y = Math.max(y + boxH, ty) + 16;

  label(full, "Cara membaca");
  for (const l of [
    "Potongan: angka pertama yang terlihat di skala tiap sisi = mm terpotong. Kiri = kanan & atas = bawah artinya gambar di tengah.",
    `Garis hitam 0 mm terlihat di 4 sisi; merah/hijau/biru = 1/2/3 mm. Batang skala harus tepat ${barMm} mm.`,
    "Warna: kotak 92–100% & 0–8% masih terbedakan, abu netral murni, gradasi mulus, kulit natural.",
  ])
    y = para(`• ${l}`, full.x, y, full.w, 16 * s, { c: "#3A3936" }) + 2;

  // ── Silang + lingkaran tengah (di atas semua) ─────────────────────────────────────────────────
  const cx = x0 + W / 2;
  const cy = H / 2;
  g.strokeStyle = "#E5332A";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx - 34, cy);
  g.lineTo(cx + 34, cy);
  g.moveTo(cx, cy - 34);
  g.lineTo(cx, cy + 34);
  g.stroke();
  g.beginPath();
  g.arc(cx, cy, 20, 0, Math.PI * 2);
  g.stroke();
  return y;
}

/** Gambar lembar tes penuh (1200×1800). `strip` = kertas 2x6x2: dua panel 600 + garis potong di tengah. */
export function drawTestChart(
  g: ChartCtx,
  info: ChartInfo,
  photo: unknown,
  strip: boolean,
  W = 1200,
  H = 1800,
) {
  if (!strip) return panel(g, 0, W, H, info, photo);
  panel(g, 0, W / 2, H, info, photo);
  const y = panel(g, W / 2, W / 2, H, info, photo);
  g.save();
  g.strokeStyle = MUTED;
  g.lineWidth = 1;
  g.setLineDash([10, 8]);
  g.beginPath();
  g.moveTo(W / 2, 0);
  g.lineTo(W / 2, H);
  g.stroke();
  g.restore();
  return y;
}
