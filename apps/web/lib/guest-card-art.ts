/**
 * Katalog kartu QR Snapbook (#230, desain Claude Design 9 Okt): 10 konsep, masing-masing kartu meja A5 (A6 = skala
 * yang sama) + kartu nama dua sisi 90×55 mm + bleed 3 mm. HTML kartu dirender `guest-card-html.ts` (server); file ini
 * aman untuk komponen klien (pengaturan admin). Urutan: formal/wedding dulu, lalu playful/netral.
 */
export const CARD_DESIGNS = [
  { id: "zamrud", name: "Lengkung Zamrud", hint: "Wedding · formal" },
  { id: "renda", name: "Renda Marun", hint: "Wedding · adat" },
  { id: "pita", name: "Pita Krem", hint: "Wedding · romantis" },
  { id: "teater", name: "Tiket Pertunjukan", hint: "Formal · nikahan gedung/hotel" },
  { id: "koran", name: "Harian Snapbook", hint: "Formal · hitam putih" },
  { id: "majalah", name: "Cover Majalah", hint: "Playful · Gen Z" },
  { id: "musik", name: "Sedang Diputar", hint: "Playful · ultah & anak muda" },
  { id: "kartupos", name: "Kartu Pos", hint: "Netral · hangat" },
  { id: "kamera", name: "Kamera Sekali Pakai", hint: "Playful · Gen Z" },
  { id: "tiket", name: "Boarding Pass", hint: "Netral · nikahan santai & kantor" },
] as const;
export type CardDesignId = (typeof CARD_DESIGNS)[number]["id"];
/** Id lama (#225 kontrak Ops v0.9, #227) → konsep terdekat. */
const LEGACY: Record<string, CardDesignId> = {
  klasik: "zamrud",
  mint: "tiket",
  butter: "kamera",
  gelap: "teater",
  "sekali-pakai": "kamera",
  polaroid: "kartupos",
  film: "musik",
  elegan: "zamrud",
  poster: "koran",
};
/** Id yang diterima dari Ops / pengaturan (konsep baru + id lama). */
export const CARD_IDS: string[] = [...CARD_DESIGNS.map((d) => d.id), ...Object.keys(LEGACY)];
export const cardDesign = (id: string | null | undefined): CardDesignId =>
  CARD_DESIGNS.find((d) => d.id === id)?.id ?? LEGACY[id ?? ""] ?? "zamrud";

export type CardData = {
  name: string;
  /** YYYY-MM-DD */
  date: string;
  url: string;
  shots: number;
  voice: boolean;
  strip: boolean;
};

export const SAMPLE_CARD: CardData = {
  name: "Wedding Rafi & Dinda",
  date: "2026-10-10",
  url: "https://booth.tetraphoto.com/c/contoh",
  shots: 15,
  voice: true,
  strip: true,
};
