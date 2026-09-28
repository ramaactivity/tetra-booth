/**
 * Filter foto pilihan tamu (DECISIONS #116): string CSS filter, dipakai template engine (`ctx.filter`, hanya ke
 * foto di slot) dan pratinjau di booth (`style.filter`) — satu definisi supaya layar = cetak = web.
 */
export const PHOTO_FILTERS = [
  { id: "normal", label: "Normal", css: "none" },
  { id: "bw", label: "Hitam Putih", css: "grayscale(1) contrast(1.1)" },
  { id: "warm", label: "Hangat", css: "sepia(0.25) saturate(1.2) brightness(1.03)" },
  { id: "faded", label: "Pudar", css: "contrast(0.85) brightness(1.08) saturate(0.8)" },
  { id: "vintage", label: "Vintage", css: "sepia(0.45) contrast(1.05) brightness(0.95)" },
] as const;
export type PhotoFilterId = (typeof PHOTO_FILTERS)[number]["id"];
export const PHOTO_FILTER_IDS = PHOTO_FILTERS.map((f) => f.id) as [
  PhotoFilterId,
  ...PhotoFilterId[],
];
export const filterCss = (id: string | null | undefined) =>
  PHOTO_FILTERS.find((f) => f.id === id)?.css ?? "none";
