/**
 * Alamat Snapbook yang mudah dibaca (#231): `/c/rafi-dinda` dari nama acara, bukan token acak. Alias dari `guest_token`
 * (token = tanda link aktif, QR lama tetap jalan). Aman untuk klien.
 */
export const GUEST_LINK = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/** Kata umum yang tidak membedakan acara ("Wedding Rafi & Dinda" → "rafi-dinda"). */
const COMMON = new Set(
  "wedding the of and dan birthday ulang tahun ke party acara engagement lamaran akad resepsi pernikahan nikahan event".split(
    " ",
  ),
);

export function readableLink(name: string) {
  const words = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const keep = words.filter((w) => !COMMON.has(w) && !/^\d+$/.test(w));
  let out = "";
  for (const w of (keep.length ? keep : words).slice(0, 4)) {
    const next = out ? `${out}-${w}` : w;
    if (next.length > 32) break;
    out = next;
  }
  return GUEST_LINK.test(out) ? out : "snapbook";
}

/** Path tamu: alamat rapi kalau ada, kalau tidak token. */
export const guestPath = (ev: { guest_link: string | null; guest_token: string | null }) =>
  `/c/${ev.guest_link ?? ev.guest_token}`;
