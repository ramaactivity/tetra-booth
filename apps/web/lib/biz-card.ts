import QRCode from "qrcode";

/**
 * Kartu QR Guest Cam ukuran kartu nama (#225): 90×55 mm + bleed 3 mm tiap sisi (96×61 mm), satu SVG untuk cetak
 * (PDF ke percetakan, 1 box isi 100) dan thumbnail katalog di portal klien Ops. Palet dari token v2 (#45).
 */
export const BIZ_CARDS = [
  { id: "klasik", name: "Klasik", bg: "#F8F7F4", fg: "#1D1D1B", sub: "#5F5E5A", under: "#CEC8F6" },
  { id: "mint", name: "Mint", bg: "#D6F1EA", fg: "#1D1D1B", sub: "#3A3936", under: "#8EDCCB" },
  { id: "butter", name: "Butter", bg: "#F8D98B", fg: "#1D1D1B", sub: "#3A3936", under: "#FFFFFF" },
  { id: "gelap", name: "Gelap", bg: "#1D1D1B", fg: "#F8F7F4", sub: "#D6D3CC", under: "#F8D98B" },
] as const;
export type BizCardId = (typeof BIZ_CARDS)[number]["id"];
export const bizCard = (id: string | undefined) =>
  BIZ_CARDS.find((c) => c.id === id) ?? BIZ_CARDS[0];

export type BizCardData = {
  name: string;
  /** YYYY-MM-DD */
  date: string;
  tagline: string | null;
  url: string;
  shots: number;
};

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** Nama acara dipecah per kata ke maks. 2 baris (SVG tidak membungkus teks sendiri). */
function lines(text: string, max: number) {
  const out: string[] = [];
  for (const w of text.split(/\s+/)) {
    const last = out.at(-1);
    if (last !== undefined && `${last} ${w}`.length <= max) out[out.length - 1] = `${last} ${w}`;
    else out.push(w);
  }
  return out.length > 2
    ? [
        out[0] ?? "",
        `${out
          .slice(1)
          .join(" ")
          .slice(0, max - 1)}…`,
      ]
    : out;
}

/** QR: modul persegi + finder membulat (sama dengan QrCode di @tetra/ui), di kotak `size` mm pada (x, y). */
function qr(url: string, x: number, y: number, size: number, ink: string) {
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

const FONT = "'Plus Jakarta Sans Variable','Plus Jakarta Sans',system-ui,sans-serif";
const MONO = "'Geist Mono',ui-monospace,monospace";

/** SVG kartu (mm). `bleed` false = tanpa bleed (thumbnail). */
export function bizCardSvg(id: string | undefined, d: BizCardData, bleed = true) {
  const c = bizCard(id);
  const b = bleed ? 3 : 0;
  const W = 90 + 2 * b;
  const H = 55 + 2 * b;
  const ink = "#1D1D1B";
  // Kolom QR kiri (34 mm), teks kanan; zona aman 4 mm dari tepi potong.
  const qx = b + 5;
  const qy = b + 10.5;
  // Lebar teks kanan ±40 mm sampai zona aman: ±14 huruf pada 5,2 mm; kata yang lebih panjang mengecilkan huruf.
  const name = lines(d.name, 14);
  const tx = b + 46;
  const date = d.date.split("-").reverse().join(".");
  const longest = Math.max(...name.map((l) => l.length));
  const nameSize =
    longest > 14 ? (5.2 * 14) / longest : name.length > 1 || longest > 10 ? 5.2 : 6.4;
  const nameY = b + (d.tagline ? 17 : 13);
  const text = (x: number, y: number, s: string, size: number, fill: string, extra = "") =>
    `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" fill="${fill}" ${extra}>${esc(s)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${c.bg}"/>
<rect x="${qx + 1.4}" y="${qy + 1.4}" width="34" height="34" rx="3" fill="${c.under}" stroke="${ink}" stroke-width="0.35"/>
<rect x="${qx}" y="${qy}" width="34" height="34" rx="3" fill="#fff" stroke="${ink}" stroke-width="0.35"/>
${qr(d.url, qx + 3, qy + 3, 28, ink)}
${d.tagline ? text(tx, b + 10, d.tagline.toUpperCase(), 2.3, c.sub, 'font-weight="800" letter-spacing="0.3"') : ""}
${name.map((l, i) => text(tx, nameY + i * (nameSize + 0.6), l, nameSize, c.fg, 'font-weight="800" letter-spacing="-0.2"')).join("")}
<text x="${tx}" y="${nameY + name.length * (nameSize + 0.6) + 1.2}" font-family="${MONO}" font-size="2.6" fill="${c.sub}">${esc(date)}</text>
${text(tx, b + 37, "Bantu isi album kami", 3.1, c.fg, 'font-weight="800"')}
${text(tx, b + 41.5, `Scan · isi nama · jepret ${d.shots} foto`, 2.3, c.sub, 'font-weight="600"')}
<rect x="${tx}" y="${b + 45.3}" width="4.2" height="4.2" rx="1.1" fill="#8EDCCB" stroke="${ink}" stroke-width="0.3"/>
${text(tx + 1.1, b + 48.5, "T", 2.6, ink, 'font-weight="800"')}
${text(tx + 5.4, b + 48.6, "tetra", 2.8, c.fg, 'font-weight="800"')}
</svg>`;
}
