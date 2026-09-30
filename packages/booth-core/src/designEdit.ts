import type { EventDesign, LayoutSpec } from "@tetra/shared";
import { copy } from "./copy";
import type { BoothEvent } from "./event";

/**
 * Editor desain di booth (DECISIONS #128/#131). Di bundle, aset desain tambahan berawalan (`d1-ov`, `p2-f1`) dan aset
 * yang diedit di booth berawalan `loc-<cap>-`; editor hanya mengenal id tetap (`ov`, `bg`, `f1..f4`, `lib-*`).
 * Buka: awalan dilepas. Simpan: id asal dipasang lagi, file baru mendapat id `loc-<cap>-<id>` (unik tiap simpan,
 * jadi FontFace/gambar lama di renderer tidak tertukar).
 */
const PREFIX = /^(?:(?:[dp]\d+|loc-[a-z0-9]+)-)+/;
export const canonId = (id: string) => id.replace(PREFIX, "");

/** Aset yang dirujuk layout (overlay, latar, font teks); "geist" = font bawaan tanpa file. */
export const layoutRefs = (l: LayoutSpec) => [
  ...new Set(
    [l.overlay?.assetId, l.background?.assetId, ...l.texts.map((t) => t.fontAssetId)].filter(
      (x): x is string => !!x && x !== "geist",
    ),
  ),
];

const mapRefs = (l: LayoutSpec, f: (id: string) => string): LayoutSpec => ({
  ...l,
  ...(l.overlay && { overlay: { ...l.overlay, assetId: f(l.overlay.assetId) } }),
  ...(l.background && {
    background: {
      ...l.background,
      ...(l.background.assetId && { assetId: f(l.background.assetId) }),
    },
  }),
  texts: l.texts.map((t) =>
    t.fontAssetId === "geist" ? t : { ...t, fontAssetId: f(t.fontAssetId) },
  ),
});

export type EditorOpen = {
  layout: LayoutSpec;
  /** id editor → nama file (untuk `files` editor). */
  files: Record<string, string>;
  /** id editor → id aset di bundle (untuk memuat byte & memasang kembali saat simpan). */
  back: Record<string, string>;
};

export function toEditor(layout: LayoutSpec, assets: Record<string, string>): EditorOpen {
  const back: Record<string, string> = {};
  const files: Record<string, string> = {};
  for (const r of layoutRefs(layout)) {
    const c = canonId(r);
    back[c] = r;
    const file = assets[r];
    if (file) files[c] = file;
  }
  return { layout: mapRefs(layout, canonId), files, back };
}

/**
 * Layout hasil editor → layout bundle. `pending` = id editor yang filenya baru dipilih (disimpan sebagai `loc-…`).
 * id layout tetap sama dengan yang dibuka (kunci override).
 */
export function fromEditor(
  edited: LayoutSpec,
  open: EditorOpen,
  id: string,
  pending: string[],
  cap: string,
): LayoutSpec {
  const fresh = new Set(pending);
  return mapRefs({ ...edited, id }, (c) =>
    fresh.has(c) ? `loc-${cap}-${c}` : (open.back[c] ?? c),
  );
}

export type DesignEntry = { id: string; name: string; info: string; layout: LayoutSpec };

/** Desain event yang bisa diedit: layout photobox, desain pilihan tamu, atau satu layout utama. */
export function eventDesigns(event: BoothEvent): DesignEntry[] {
  const list: EventDesign[] | undefined = event.photobox?.layouts ?? event.designs;
  if (list?.length) return list.map((d) => ({ ...d, id: d.layout.id }));
  return [{ id: event.layout.id, name: copy.crew.mainDesign, info: "", layout: event.layout }];
}
