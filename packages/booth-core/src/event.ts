import type { LayoutSpec } from "@tetra/shared";
import { DEFAULT_SETTINGS, type EventSettings } from "./session";

export type BoothEvent = {
  /** ID event cloud; "local" sampai event dari bundle ada (M6). */
  id: string;
  name: string;
  /** Tanggal tampil di strip, mis. "12 Oktober 2026". */
  date: string;
  layout: LayoutSpec;
  settings: EventSettings;
};

/** Strip klasik 2×6 (dicetak berdua di 4R), 3 foto 3:2. Dipakai sampai event dari bundle ada (M6). */
export const DEFAULT_LAYOUT: LayoutSpec = {
  id: "default-strip",
  version: 1,
  paper: "2x6x2",
  canvas: { width: 600, height: 1800, dpi: 300 },
  background: { color: "#ffffff" },
  slots: [0, 1, 2].map((i) => ({
    id: `s${i + 1}`,
    x: 30,
    y: 30 + i * 390,
    w: 540,
    h: 360,
    fit: "cover" as const,
    z: "below_overlay" as const,
  })),
  texts: [
    {
      x: 30,
      y: 1330,
      w: 540,
      fontAssetId: "geist",
      size: 52,
      color: "#1a1714",
      align: "center",
      value: "{event_name}",
    },
    {
      x: 30,
      y: 1410,
      w: 540,
      fontAssetId: "geist",
      size: 28,
      color: "#8a847d",
      align: "center",
      value: "{date}",
    },
  ],
};

export const DEFAULT_EVENT: BoothEvent = {
  id: "local",
  name: "Tetra Booth",
  date: new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date()),
  layout: DEFAULT_LAYOUT,
  settings: DEFAULT_SETTINGS,
};
