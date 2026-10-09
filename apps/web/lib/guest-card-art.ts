import QRCode from "qrcode";

/**
 * Kartu QR Kamera Tamu / Guest Cam (#227): 5 desain dengan tata letak berbeda (bukan sekadar warna), untuk
 * standing akrilik A6/A5 (potret, rasio sama) dan kartu nama dua sisi (90×55 mm + bleed 3 mm). Satu SVG untuk cetak
 * (PDF dari browser) dan thumbnail katalog portal Ops. Konsep: "kamera sekali pakai di HP-mu" — tamu Indonesia
 * belum kenal guest cam, jadi tiap kartu menjawab: apa ini, kenapa ikut, gratis & tanpa install, 3 langkah.
 */
export const CARD_DESIGNS = [
  { id: "sekali-pakai", name: "Sekali Pakai", hint: "QR jadi jendela kamera disposable" },
  { id: "polaroid", name: "Polaroid", hint: "QR di dalam foto polaroid" },
  { id: "film", name: "Roll Film", hint: "Pita film berisi 3 langkah" },
  { id: "elegan", name: "Elegan", hint: "Tipografi tenang ala undangan" },
  { id: "poster", name: "Poster Jelas", hint: "Huruf besar, paling mudah dari jauh" },
] as const;
export type CardDesignId = (typeof CARD_DESIGNS)[number]["id"];
/** Id lama (#225, kontrak Ops v0.9) → desain baru. */
const LEGACY: Record<string, CardDesignId> = {
  klasik: "elegan",
  mint: "polaroid",
  butter: "sekali-pakai",
  gelap: "film",
};
/** Id yang diterima dari Ops / pengaturan (desain baru + id lama v0.9). */
export const CARD_IDS: string[] = [...CARD_DESIGNS.map((d) => d.id), ...Object.keys(LEGACY)];
export const cardDesign = (id: string | null | undefined): CardDesignId =>
  CARD_DESIGNS.find((d) => d.id === id)?.id ?? LEGACY[id ?? ""] ?? "sekali-pakai";

export type CardData = {
  name: string;
  /** YYYY-MM-DD */
  date: string;
  url: string;
  shots: number;
  reveal: "live" | "after";
  voice: boolean;
  strip: boolean;
};

const C = {
  ink: "#1D1D1B",
  paper: "#F8F7F4",
  white: "#FFFFFF",
  butter: "#F8D98B",
  mint: "#8EDCCB",
  mintSoft: "#D6F1EA",
  lavender: "#CEC8F6",
  peach: "#FCE3C6",
  sky: "#D6EEF8",
  text2: "#5F5E5A",
  muted: "#8A8883",
  orange: "#FF9A3C",
};
const SANS = "'Plus Jakarta Sans Variable','Plus Jakarta Sans',system-ui,sans-serif";
const MONO = "'Geist Mono',ui-monospace,monospace";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** Pecah teks per kata ke maks. `n` baris (SVG tidak membungkus teks sendiri). */
export function wrap(text: string, max: number, n = 2) {
  const out: string[] = [];
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const last = out.at(-1);
    if (last !== undefined && `${last} ${w}`.length <= max) out[out.length - 1] = `${last} ${w}`;
    else out.push(w);
  }
  return out.length > n
    ? [
        ...out.slice(0, n - 1),
        `${out
          .slice(n - 1)
          .join(" ")
          .slice(0, max - 1)}…`,
      ]
    : out;
}

type TextOpt = {
  size: number;
  fill?: string;
  weight?: number;
  anchor?: "start" | "middle" | "end";
  font?: string;
  spacing?: number;
};
const t = (x: number, y: number, s: string, o: TextOpt) =>
  `<text x="${x}" y="${y}" font-family="${o.font ?? SANS}" font-size="${o.size}" font-weight="${o.weight ?? 500}" fill="${o.fill ?? C.ink}" text-anchor="${o.anchor ?? "start"}"${o.spacing ? ` letter-spacing="${o.spacing}"` : ""}>${esc(s)}</text>`;
/** Beberapa baris teks; kembalikan SVG + y setelah baris terakhir. */
const lines = (x: number, y: number, ls: string[], o: TextOpt, gap = 1.18) => ({
  svg: ls.map((l, i) => t(x, y + i * o.size * gap, l, o)).join(""),
  end: y + (ls.length - 1) * o.size * gap,
});
/** Ukuran huruf supaya baris terpanjang muat di `width` mm (perkiraan lebar huruf 0,56 em). */
const fit = (ls: string[], width: number, max: number) =>
  Math.min(max, width / (0.56 * Math.max(1, ...ls.map((l) => l.length))));

/** QR asli + finder membulat (sama dengan @tetra/ui QrCode), di kotak `size` mm. */
function qr(url: string, x: number, y: number, size: number, ink = C.ink) {
  const m = QRCode.create(url, { errorCorrectionLevel: "M" }).modules;
  const n = m.size;
  const finder = (cx: number, cy: number) =>
    (cx < 7 && cy < 7) || (cx >= n - 7 && cy < 7) || (cx < 7 && cy >= n - 7);
  let d = "";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) if (!finder(c, r) && m.get(r, c)) d += `M${c} ${r}h1v1h-1z`;
  const eye = (ex: number, ey: number) =>
    `<rect x="${ex}" y="${ey}" width="7" height="7" rx="1.5" fill="${ink}"/><rect x="${ex + 1}" y="${ey + 1}" width="5" height="5" rx="1" fill="#fff"/><rect x="${ex + 2}" y="${ey + 2}" width="3" height="3" rx="0.6" fill="${ink}"/>`;
  return `<g transform="translate(${x} ${y}) scale(${size / n})"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="${ink}" shape-rendering="crispEdges"/>${eye(0, 0)}${eye(n - 7, 0)}${eye(0, n - 7)}</g>`;
}

/** Ikon garis 10×10 (skala `s`): HP, orang, kamera. */
const ICON = {
  phone:
    '<rect x="2.6" y="0.6" width="4.8" height="8.8" rx="1" fill="none"/><path d="M4.3 1.6h1.4"/><circle cx="5" cy="8.1" r="0.35"/>',
  user: '<circle cx="5" cy="3.2" r="2" fill="none"/><path d="M1.4 9.4c0.4-2.4 1.8-3.6 3.6-3.6s3.2 1.2 3.6 3.6" fill="none"/>',
  camera:
    '<rect x="0.6" y="2.4" width="8.8" height="6.4" rx="1.2" fill="none"/><path d="M3.2 2.4l0.8-1.4h2l0.8 1.4" fill="none"/><circle cx="5" cy="5.6" r="1.8" fill="none"/>',
  mic: '<rect x="3.6" y="0.8" width="2.8" height="5.2" rx="1.4" fill="none"/><path d="M2.2 4.8c0 1.8 1.2 3 2.8 3s2.8-1.2 2.8-3M5 7.8v1.6" fill="none"/>',
};
const icon = (k: keyof typeof ICON, x: number, y: number, s: number, stroke = C.ink) =>
  `<g transform="translate(${x} ${y}) scale(${s / 10})" stroke="${stroke}" stroke-width="${0.9}" stroke-linecap="round" stroke-linejoin="round" fill="${stroke}">${ICON[k]}</g>`;

/** Logo kecil "tetra" (tinggi `h`). */
const brand = (x: number, y: number, h: number, fg = C.ink, anchor: "start" | "end" = "start") => {
  const w = h * 3.3;
  const x0 = anchor === "end" ? x - w : x;
  return `<rect x="${x0}" y="${y - h * 0.82}" width="${h}" height="${h}" rx="${h * 0.26}" fill="${C.mint}" stroke="${C.ink}" stroke-width="${h * 0.07}"/>${t(x0 + h / 2, y - h * 0.08, "T", { size: h * 0.62, weight: 800, anchor: "middle" })}${t(x0 + h * 1.28, y - h * 0.08, "tetra", { size: h * 0.78, weight: 800, fill: fg })}`;
};

const dotDate = (d: string) => d.split("-").reverse().join(".");
/** Pasangan / nama acara tanpa awalan "Wedding". */
const couple = (name: string) => name.replace(/^(the\s+)?wedding\s+(of\s+)?/i, "").trim() || name;

const COPY = {
  kicker: "KAMERA TAMU",
  hook: "Ikut motret di acara ini!",
  what: (c: string) => `Foto pakai HP-mu, langsung masuk album ${c}.`,
  free: "Gratis · tanpa install aplikasi",
  steps: (shots: number) =>
    [
      ["phone", "Scan QR", "pakai kamera HP"],
      ["user", "Isi nama", "sekali saja"],
      ["camera", "Jepret!", `${shots} foto per HP`],
    ] as const,
  bonus: (d: CardData) =>
    d.voice && d.strip
      ? "Bonus: kirim ucapan suara & bikin frame foto"
      : d.voice
        ? "Bonus: kirim ucapan suara buat pengantin"
        : d.strip
          ? "Bonus: susun fotomu jadi frame cantik"
          : "",
  reveal: (d: CardData) =>
    d.reveal === "after"
      ? "Fotonya dibuka setelah acara, kayak cuci film"
      : "Fotomu langsung tampil di album acara",
};

const svgDoc = (w: number, h: number, body: string, size?: { w: number; h: number }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size?.w ?? w}mm" height="${size?.h ?? h}mm" viewBox="0 0 ${w} ${h}">${body}</svg>`;

/* ───────────────────────────── A6 / A5 (potret 105×148, A5 = skala 1,414) ───────────────────────────── */

const W = 105;
const H = 148;

function stepsRow(d: CardData, y: number, fg = C.ink, sub = C.text2, x0 = 10, x1 = 95) {
  const col = (x1 - x0) / 3;
  return COPY.steps(d.shots)
    .map(([ic, a, b], i) => {
      const cx = x0 + col * i + col / 2;
      return `${icon(ic, cx - 4, y, 8, fg)}${t(cx, y + 13.5, `${i + 1}. ${a}`, { size: 3.6, weight: 800, anchor: "middle", fill: fg })}${t(cx, y + 18, b, { size: 2.7, weight: 600, anchor: "middle", fill: sub })}`;
    })
    .join("");
}

const A6: Record<CardDesignId, (d: CardData) => string> = {
  // 1. Kamera sekali pakai: badan kamera kuning, QR = jendela foto, penghitung film = jatah foto.
  "sekali-pakai": (d) => {
    const c = couple(d.name);
    const nm = wrap(c, 18);
    const ns = Math.min(fit(nm, 85, 8.6), nm.length > 1 ? 7.4 : 8.6);
    const name = lines(
      W / 2,
      86,
      nm,
      { size: ns, weight: 800, anchor: "middle", spacing: -0.3 },
      1.05,
    );
    const what = lines(
      W / 2,
      name.end + 11,
      wrap(COPY.what(c), 46),
      { size: 2.9, weight: 600, anchor: "middle", fill: C.text2 },
      1.3,
    );
    const free = what.end + 4.6;
    return [
      `<rect width="${W}" height="${H}" fill="${C.paper}"/>`,
      // badan kamera
      `<rect x="11" y="9" width="83" height="66" rx="6" fill="${C.ink}" transform="translate(1.8 1.8)"/>`,
      `<rect x="11" y="9" width="83" height="66" rx="6" fill="${C.butter}" stroke="${C.ink}" stroke-width="0.8"/>`,
      `<path d="M11 22.5h83" stroke="${C.ink}" stroke-width="0.6"/>`,
      `<rect x="16" y="12.5" width="14" height="6.5" rx="1.3" fill="${C.white}" stroke="${C.ink}" stroke-width="0.6"/>`,
      t(23, 17.2, "FLASH", { size: 2.2, weight: 800, anchor: "middle", spacing: 0.3 }),
      t(46, 17.4, COPY.kicker, { size: 2.6, weight: 800, anchor: "middle", spacing: 0.5 }),
      `<rect x="62" y="12" width="13" height="7.5" rx="1.5" fill="${C.ink}"/>`,
      t(68.5, 17.6, String(d.shots).padStart(2, "0"), {
        size: 4,
        weight: 700,
        anchor: "middle",
        fill: C.orange,
        font: MONO,
      }),
      `<circle cx="85" cy="15.8" r="3.3" fill="${C.ink}"/><circle cx="85" cy="15.8" r="1.9" fill="${C.orange}"/>`,
      // jendela foto = QR
      `<rect x="31.5" y="26" width="42" height="42" rx="3" fill="${C.white}" stroke="${C.ink}" stroke-width="0.8"/>`,
      qr(d.url, 34.5, 29, 36),
      t(W / 2, 72.2, "scan QR ini pakai kamera HP", { size: 2.6, weight: 700, anchor: "middle" }),
      // teks
      name.svg,
      t(W / 2, name.end + 6.5, COPY.hook, { size: 4.6, weight: 800, anchor: "middle" }),
      what.svg,
      t(W / 2, free, COPY.free, { size: 2.9, weight: 800, anchor: "middle" }),
      stepsRow(d, Math.min(free + 5, 121), C.ink, C.text2),
      `<path d="M10 141.5h85" stroke="${C.ink}" stroke-width="0.3" stroke-dasharray="1 1"/>`,
      t(10, 145.6, COPY.reveal(d), { size: 2.3, weight: 600, fill: C.text2 }),
      brand(95, 145.8, 3.2, C.ink, "end"),
    ].join("");
  },

  // 2. Polaroid: latar mint, polaroid miring berisi QR, langkah bernomor ke bawah.
  polaroid: (d) => {
    const c = couple(d.name);
    const nm = wrap(c, 18);
    const ns = Math.min(fit(nm, 80, 8), nm.length > 1 ? 7 : 8);
    const name = lines(12, 89, nm, { size: ns, weight: 800, spacing: -0.3 }, 1.05);
    const what = lines(
      12,
      name.end + 11.6,
      wrap(COPY.what(c), 50),
      { size: 2.7, weight: 600, fill: C.text2 },
      1.3,
    );
    const sy = what.end + 6;
    return [
      `<rect width="${W}" height="${H}" fill="${C.mintSoft}"/>`,
      `<rect x="12" y="9" width="32" height="7" rx="3.5" fill="${C.ink}"/>`,
      t(28, 13.9, COPY.kicker, {
        size: 2.7,
        weight: 800,
        anchor: "middle",
        fill: C.white,
        spacing: 0.6,
      }),
      t(93, 13.9, dotDate(d.date), { size: 2.9, weight: 600, anchor: "end", font: MONO }),
      `<g transform="rotate(-4 52.5 47)">`,
      `<rect x="29" y="21" width="47" height="56" rx="1.4" fill="${C.ink}" transform="translate(1.5 1.7)"/>`,
      `<rect x="29" y="21" width="47" height="56" rx="1.4" fill="${C.white}" stroke="${C.ink}" stroke-width="0.6"/>`,
      qr(d.url, 33, 25, 39),
      t(52.5, 72, "scan aku pakai kamera HP", { size: 2.8, weight: 700, anchor: "middle" }),
      `</g>`,
      `<rect x="45" y="17.5" width="15" height="5.5" fill="${C.butter}" opacity="0.92" transform="rotate(-8 52.5 20)"/>`,
      name.svg,
      t(12, name.end + 6.6, COPY.hook, { size: 4.3, weight: 800 }),
      what.svg,
      ...COPY.steps(d.shots).map(([ic, a, b], i) => {
        const y = sy + i * 7.2;
        return `<circle cx="15.5" cy="${y}" r="3" fill="${C.white}" stroke="${C.ink}" stroke-width="0.5"/>${t(15.5, y + 1.1, String(i + 1), { size: 3.1, weight: 800, anchor: "middle", font: MONO })}${icon(ic, 21, y - 2.6, 5.2)}${t(29, y - 0.1, a, { size: 3.3, weight: 800 })}${t(29, y + 3, b, { size: 2.4, weight: 600, fill: C.text2 })}`;
      }),
      t(12, 141.6, COPY.free, { size: 2.6, weight: 800 }),
      t(12, 145.4, COPY.reveal(d), { size: 2.3, weight: 600, fill: C.text2 }),
      brand(93, 145.6, 3.1, C.ink, "end"),
    ].join("");
  },

  // 3. Roll film: pita film tinta di kiri berisi 3 langkah, kanan QR dengan tanda bidik.
  film: (d) => {
    const c = couple(d.name);
    const nm = wrap(c, 15, 3);
    const ns = fit(nm, 62, 8);
    const holes = Array.from({ length: 13 }, (_, i) => {
      const y = 5 + i * 11;
      return `<rect x="3" y="${y}" width="3.2" height="4.4" rx="0.8" fill="${C.paper}"/><rect x="26.8" y="${y}" width="3.2" height="4.4" rx="0.8" fill="${C.paper}"/>`;
    }).join("");
    const frames = COPY.steps(d.shots)
      .map(([ic, a, b], i) => {
        const y = 28 + i * 34;
        return `<rect x="8.5" y="${y}" width="16" height="28" rx="1" fill="#2E2D2B"/>${t(16.5, y + 5, `0${i + 1}`, { size: 2.6, weight: 700, anchor: "middle", fill: C.orange, font: MONO })}${icon(ic, 12.5, y + 8, 8, C.white)}${t(16.5, y + 21.5, a, { size: 2.7, weight: 800, anchor: "middle", fill: C.white })}${t(16.5, y + 25, b.split(" ").slice(0, 2).join(" "), { size: 1.9, weight: 600, anchor: "middle", fill: "#BDBAB3" })}`;
      })
      .join("");
    const tick = (x: number, y: number, dx: number, dy: number) =>
      `<path d="M${x} ${y + dy * 6}V${y}H${x + dx * 6}" fill="none" stroke="${C.ink}" stroke-width="1"/>`;
    const name = lines(39, 30, nm, { size: ns, weight: 800, spacing: -0.3 }, 1.05);
    const qy = Math.max(name.end + 9, 55);
    return [
      `<rect width="${W}" height="${H}" fill="${C.paper}"/>`,
      `<rect x="0" y="0" width="33" height="${H}" fill="${C.ink}"/>`,
      holes,
      t(16.5, 18, "ROLL", {
        size: 2.4,
        weight: 800,
        anchor: "middle",
        fill: C.white,
        spacing: 0.6,
      }),
      t(16.5, 22, "TAMU", {
        size: 2.4,
        weight: 800,
        anchor: "middle",
        fill: C.white,
        spacing: 0.6,
      }),
      frames,
      t(39, 14, COPY.kicker, { size: 3, weight: 800, spacing: 0.8, fill: C.orange }),
      t(39, 19.5, dotDate(d.date), { size: 2.8, weight: 600, font: MONO, fill: C.text2 }),
      name.svg,
      tick(41, qy, 1, 1),
      tick(95, qy, -1, 1),
      tick(41, qy + 54, 1, -1),
      tick(95, qy + 54, -1, -1),
      qr(d.url, 45, qy + 4, 46),
      t(68, qy + 61, COPY.hook, { size: 4.1, weight: 800, anchor: "middle" }),
      t(68, qy + 66, "Foto pakai HP-mu, masuk album", {
        size: 2.7,
        weight: 600,
        anchor: "middle",
        fill: C.text2,
      }),
      t(68, qy + 69.6, c.slice(0, 30), { size: 2.7, weight: 800, anchor: "middle", fill: C.text2 }),
      t(68, qy + 75, COPY.free, { size: 2.7, weight: 800, anchor: "middle" }),
      t(39, 140.6, COPY.reveal(d), { size: 2.2, weight: 600, fill: C.text2 }),
      brand(97, 145.8, 3.1, C.ink, "end"),
    ].join("");
  },

  // 4. Elegan: tipografi tenang ala undangan, bingkai garis ganda, QR kecil di tengah.
  elegan: (d) => {
    const c = couple(d.name);
    const nm = wrap(c, 16);
    const ns = fit(nm, 75, 10);
    const name = lines(
      W / 2,
      38,
      nm,
      { size: ns, weight: 300, anchor: "middle", spacing: -0.2 },
      1.08,
    );
    const y = name.end + 8;
    return [
      `<rect width="${W}" height="${H}" fill="${C.paper}"/>`,
      `<rect x="5" y="5" width="95" height="138" fill="none" stroke="${C.ink}" stroke-width="0.5"/>`,
      `<rect x="7" y="7" width="91" height="134" fill="none" stroke="${C.ink}" stroke-width="0.25"/>`,
      t(W / 2, 20, COPY.kicker, { size: 2.8, weight: 700, anchor: "middle", spacing: 1.6 }),
      `<path d="M44 23.5h17" stroke="${C.ink}" stroke-width="0.3"/>`,
      name.svg,
      t(W / 2, y, dotDate(d.date), {
        size: 2.8,
        weight: 500,
        anchor: "middle",
        font: MONO,
        fill: C.text2,
      }),
      t(W / 2, y + 9, "Abadikan momen dari mejamu.", { size: 3.6, weight: 600, anchor: "middle" }),
      t(W / 2, y + 14, "Foto pakai HP, langsung masuk album pengantin.", {
        size: 2.7,
        weight: 500,
        anchor: "middle",
        fill: C.text2,
      }),
      `<rect x="34" y="${y + 19}" width="37" height="37" fill="${C.white}" stroke="${C.ink}" stroke-width="0.3"/>`,
      qr(d.url, 36.5, y + 21.5, 32),
      t(W / 2, y + 62, "SCAN  ·  ISI NAMA  ·  JEPRET", {
        size: 2.9,
        weight: 700,
        anchor: "middle",
        spacing: 0.6,
      }),
      t(W / 2, y + 67, `${d.shots} foto per HP · ${COPY.free.toLowerCase()}`, {
        size: 2.5,
        weight: 500,
        anchor: "middle",
        fill: C.text2,
      }),
      COPY.bonus(d)
        ? t(W / 2, y + 71.5, COPY.bonus(d), {
            size: 2.4,
            weight: 500,
            anchor: "middle",
            fill: C.text2,
          })
        : "",
      brand(W / 2 + 5.5, 136, 3, C.ink, "end"),
    ].join("");
  },

  // 5. Poster jelas: pita atas "SCAN & FOTO", QR besar, 3 langkah dengan kotak ikon berwarna.
  poster: (d) => {
    const c = couple(d.name);
    const boxes = [C.butter, C.mint, C.lavender];
    return [
      `<rect width="${W}" height="${H}" fill="${C.white}"/>`,
      `<rect width="${W}" height="27" fill="${C.ink}"/>`,
      t(W / 2, 13.5, "SCAN & FOTO", {
        size: 10,
        weight: 800,
        anchor: "middle",
        fill: C.white,
        spacing: -0.2,
      }),
      t(W / 2, 21.5, `Kamera tamu di acara ${c}`.slice(0, 46), {
        size: 3.2,
        weight: 600,
        anchor: "middle",
        fill: C.butter,
      }),
      `<rect x="25" y="32" width="55" height="55" rx="3" fill="${C.white}" stroke="${C.ink}" stroke-width="1"/>`,
      qr(d.url, 28.5, 35.5, 48),
      t(W / 2, 93, "Foto pakai HP-mu, langsung masuk album.", {
        size: 3.3,
        weight: 700,
        anchor: "middle",
      }),
      ...COPY.steps(d.shots).map(([ic, a, b], i) => {
        const y = 99 + i * 12;
        return `<rect x="12" y="${y}" width="10" height="10" rx="2" fill="${boxes[i]}" stroke="${C.ink}" stroke-width="0.5"/>${icon(ic, 13.5, y + 1.5, 7)}${t(26, y + 4.6, a, { size: 4.2, weight: 800 })}${t(26, y + 8.6, b, { size: 2.9, weight: 600, fill: C.text2 })}${t(93, y + 6.6, String(i + 1), { size: 7, weight: 800, anchor: "end", fill: "#E4E2DC" })}`;
      }),
      `<rect x="0" y="136" width="${W}" height="12" fill="${C.butter}"/>`,
      t(8, 143.6, "GRATIS · TANPA INSTALL · LANGSUNG MASUK ALBUM", {
        size: 2.6,
        weight: 800,
        spacing: 0.2,
      }),
      brand(98, 143.8, 3.1, C.ink, "end"),
    ].join("");
  },
};

/** Kartu meja potret. `a5` = ukuran A5 (148×210 mm) dengan tata letak sama. */
export const tableCardSvg = (id: string | null | undefined, d: CardData, a5 = false) =>
  svgDoc(W, H, A6[cardDesign(id)](d), a5 ? { w: 148, h: 210 } : undefined);

/* ───────────────────────────── Kartu nama 90×55 + bleed 3 (96×61) ───────────────────────────── */

const B = 3;
const CW = 90 + 2 * B;
const CH = 55 + 2 * B;
const BG: Record<CardDesignId, { bg: string; fg: string; sub: string }> = {
  "sekali-pakai": { bg: C.butter, fg: C.ink, sub: "#3A3936" },
  polaroid: { bg: C.mintSoft, fg: C.ink, sub: C.text2 },
  film: { bg: C.ink, fg: C.paper, sub: "#BDBAB3" },
  elegan: { bg: C.paper, fg: C.ink, sub: C.text2 },
  poster: { bg: C.white, fg: C.ink, sub: C.text2 },
};

/** Sisi depan: ajakan + nama acara + QR dengan perlakuan khas tiap desain. */
function cardFront(id: CardDesignId, d: CardData) {
  const { bg, fg, sub } = BG[id];
  const c = couple(d.name);
  const nm = wrap(c, 14);
  const ns = fit(nm, 40, 5.6);
  const tx = B + 47;
  const qrBlock: Record<CardDesignId, string> = {
    "sekali-pakai": `<rect x="${B + 5}" y="${B + 6}" width="38" height="43" rx="3" fill="${C.ink}"/><rect x="${B + 7}" y="${B + 8.5}" width="34" height="34" rx="1.5" fill="#fff"/>${qr(d.url, B + 8.5, B + 10, 31)}<circle cx="${B + 37}" cy="${B + 46}" r="1.6" fill="${C.orange}"/>${t(B + 10, B + 47, `${d.shots} FOTO`, { size: 2.2, weight: 700, fill: C.orange, font: MONO })}`,
    polaroid: `<g transform="rotate(-4 ${B + 24} ${B + 28})"><rect x="${B + 6}" y="${B + 5}" width="36" height="44" fill="#fff" stroke="${C.ink}" stroke-width="0.4"/>${qr(d.url, B + 8.5, B + 7.5, 31)}${t(B + 24, B + 45.5, "scan aku", { size: 2.4, weight: 700, anchor: "middle" })}</g>`,
    film: `<rect x="${B + 4}" y="${B + 4}" width="40" height="47" rx="1" fill="#2E2D2B"/>${Array.from({ length: 6 }, (_, i) => `<rect x="${B + 5}" y="${B + 6 + i * 7.6}" width="1.8" height="3" rx="0.4" fill="${C.ink}"/><rect x="${B + 41.2}" y="${B + 6 + i * 7.6}" width="1.8" height="3" rx="0.4" fill="${C.ink}"/>`).join("")}<rect x="${B + 8.5}" y="${B + 9}" width="31" height="31" fill="#fff"/>${qr(d.url, B + 9.5, B + 10, 29)}${t(B + 24, B + 46.5, "ROLL TAMU · 01", { size: 2.1, weight: 700, anchor: "middle", fill: C.orange, font: MONO })}`,
    elegan: `<rect x="${B + 6}" y="${B + 9}" width="34" height="34" fill="#fff" stroke="${C.ink}" stroke-width="0.3"/>${qr(d.url, B + 8, B + 11, 30)}`,
    poster: `<rect x="${B}" y="${B}" width="46" height="55" fill="${C.ink}"/><rect x="${B + 5}" y="${B + 6}" width="36" height="36" rx="2" fill="#fff"/>${qr(d.url, B + 7, B + 8, 32)}${t(B + 23, B + 49, "SCAN & FOTO", { size: 3.6, weight: 800, anchor: "middle", fill: C.butter })}`,
  };
  const name = lines(
    tx,
    B + 17,
    nm,
    { size: ns, weight: id === "elegan" ? 300 : 800, fill: fg, spacing: -0.2 },
    1.06,
  );
  return svgDoc(
    CW,
    CH,
    [
      `<rect width="${CW}" height="${CH}" fill="${bg}"/>`,
      id === "elegan"
        ? `<rect x="${B + 2.5}" y="${B + 2.5}" width="85" height="50" fill="none" stroke="${C.ink}" stroke-width="0.25"/>`
        : "",
      qrBlock[id],
      t(tx, B + 10, COPY.kicker, {
        size: 2.3,
        weight: 800,
        spacing: 0.6,
        fill: id === "film" ? C.orange : fg,
      }),
      name.svg,
      t(tx, name.end + 6, COPY.hook, { size: 2.9, weight: 800, fill: fg }),
      t(tx, name.end + 10, "Foto pakai HP-mu, langsung", { size: 2.25, weight: 600, fill: sub }),
      t(tx, name.end + 13, "masuk album acara.", { size: 2.25, weight: 600, fill: sub }),
      t(tx, B + 44, "Gratis · tanpa install", { size: 2.25, weight: 800, fill: fg }),
      brand(tx, B + 50.5, 2.7, fg),
    ].join(""),
  );
}

/** Sisi belakang: cara ikut, 3 langkah bergambar, bonus & catatan foto. */
function cardBack(id: CardDesignId, d: CardData) {
  const { bg, fg, sub } = BG[id];
  const steps = COPY.steps(d.shots)
    .map(([ic, a, b], i) => {
      const x = B + 7 + i * 27.5;
      return `<rect x="${x}" y="${B + 16}" width="22" height="22" rx="${id === "elegan" ? 0 : 3}" fill="${id === "film" ? "#2E2D2B" : C.white}" stroke="${fg}" stroke-width="0.4"/>${t(x + 3, B + 21, String(i + 1), { size: 3, weight: 800, font: MONO, fill: id === "film" ? C.orange : fg })}${icon(ic, x + 7, B + 21.5, 8, fg)}${t(x + 11, B + 43.5, a, { size: 3, weight: 800, anchor: "middle", fill: fg })}${t(x + 11, B + 47, b, { size: 2.1, weight: 600, anchor: "middle", fill: sub })}`;
    })
    .join("");
  const bonus = COPY.bonus(d);
  return svgDoc(
    CW,
    CH,
    [
      `<rect width="${CW}" height="${CH}" fill="${bg}"/>`,
      t(B + 7, B + 10.5, "Cara ikut motret", { size: 4.2, weight: 800, fill: fg }),
      t(B + 83, B + 10.5, "tanpa install aplikasi", {
        size: 2.3,
        weight: 700,
        anchor: "end",
        fill: sub,
      }),
      steps,
      t(B + 7, B + 52, bonus || COPY.reveal(d), { size: 2.2, weight: 600, fill: sub }),
    ].join(""),
  );
}

export const businessCardSvgs = (id: string | null | undefined, d: CardData) => {
  const k = cardDesign(id);
  return { front: cardFront(k, d), back: cardBack(k, d) };
};

/** Data contoh untuk thumbnail katalog. */
export const SAMPLE_CARD: CardData = {
  name: "Wedding Rina & Dimas",
  date: "2026-12-12",
  url: "https://booth.tetraphoto.com/c/contoh",
  shots: 15,
  reveal: "live",
  voice: true,
  strip: true,
};
