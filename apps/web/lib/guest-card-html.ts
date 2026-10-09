import "server-only";
import { dateVars } from "@tetra/template-engine";
import QRCode from "qrcode";
import type { CardData, CardDesignId } from "@/lib/guest-card-art";
import CARDS from "@/lib/snapbook-cards.json";

export type CardFace = "a5" | "front" | "back";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/**
 * HTML satu sisi kartu QR Snapbook (#230), persis template desainer (`lib/snapbook-cards.json`): placeholder diisi data
 * event, QR asli (SVG vektor, tinta di atas putih). Baris voice note / bikin frame disembunyikan kalau fiturnya
 * mati (`[id=if-*]`, template menjamin susunan tetap rapi); `{frame_no}` = 5 kalau voice aktif, 4 kalau tidak.
 * Teks `data-fit` dipadatkan di browser oleh `CardFit`.
 */
export async function cardHtml(id: CardDesignId, face: CardFace, d: CardData) {
  const svg = await QRCode.toString(d.url, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#1D1D1BFF", light: "#FFFFFFFF" },
  });
  const v: Record<string, string> = {
    ...dateVars(d.date),
    event_name: esc(d.name),
    shots: String(d.shots),
    frame_no: d.voice ? "5" : "4",
    qr_src: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  };
  const hide = [!d.voice && "[id=if-voice]", !d.strip && "[id=if-frame]"].filter(Boolean);
  const html = (CARDS as Record<string, string>)[`${id}-${face}`] ?? "";
  return `${hide.length ? `<style>${hide.join(",")}{display:none!important}</style>` : ""}${html.replace(
    /\{(event_name|date_iso|date_long|date_dot|shots|frame_no|qr_src)\}/g,
    (_, k: string) => v[k] ?? "",
  )}`;
}

/** Font Google yang dipakai template kartu (halaman cetak dibuka admin di browser, jadi selalu online). */
export const CARD_FONTS =
  "https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,500;0,6..96,600;0,6..96,700;1,6..96,500;1,6..96,600&family=Pinyon+Script&family=Reenie+Beanie&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;0,6..72,700;0,6..72,800;1,6..72,400&family=UnifrakturMaguntia&family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&display=swap";
