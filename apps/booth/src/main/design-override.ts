import { type EventBundle, type LayoutSpec, LayoutSpecSchema } from "@tetra/shared";
import { z } from "zod";

/**
 * Desain yang diedit di booth (DECISIONS #128/#131): override lokal per event, seperti pengaturan #100.
 * Layout disimpan di kv SQLite dan file aset barunya di `events/<id>/local/`, jadi Sync dari Cloud (yang hanya
 * menyentuh `events/<id>/bundle*`) tidak menimpanya. Kunci = `layout.id`; layout dengan id itu di `layout`,
 * `designs`, atau `photobox.layouts` diganti. Kalau cloud menerbitkan versi baru (id layout berubah), override
 * lama tidak berlaku lagi.
 */
const fileName = z.string().regex(/^[\w][\w.-]*$/);
export const DesignOverride = z.object({
  layouts: z.record(z.string(), LayoutSpecSchema).default({}),
  /** assetId → nama file di folder `local/` (overlay/latar/font baru dan font pustaka yang belum ada di bundle). */
  assets: z.record(z.string(), fileName).default({}),
  /** layout.id → ISO waktu simpan. */
  savedAt: z.record(z.string(), z.string()).default({}),
});
export type DesignOverride = z.infer<typeof DesignOverride>;

export const designKey = (eventId: string) => `design_override:${eventId}`;
export const EMPTY_DESIGN: DesignOverride = { layouts: {}, assets: {}, savedAt: {} };

/** Isi kv → override; rusak/kosong = tanpa override. */
export const parseDesignOverride = (raw: string | null): DesignOverride => {
  if (!raw) return EMPTY_DESIGN;
  try {
    const r = DesignOverride.safeParse(JSON.parse(raw));
    return r.success ? r.data : EMPTY_DESIGN;
  } catch {
    return EMPTY_DESIGN;
  }
};

/** layout.id yang ada di bundle (utama, desain pilihan, layout photobox). */
export const layoutIds = (b: EventBundle) =>
  new Set([
    b.layout.id,
    ...(b.designs ?? []).map((d) => d.layout.id),
    ...(b.photobox?.layouts ?? []).map((l) => l.layout.id),
  ]);

/** Pasang layout override ke bundle; aset lokal ikut terdaftar (bundle tetap, lokal menang kalau id sama). */
export const applyDesignOverride = <B extends EventBundle>(b: B, o: DesignOverride): B => {
  if (!Object.keys(o.layouts).length) return b;
  const pick = (l: LayoutSpec) => o.layouts[l.id] ?? l;
  return {
    ...b,
    layout: pick(b.layout),
    ...(b.designs && { designs: b.designs.map((d) => ({ ...d, layout: pick(d.layout) })) }),
    ...(b.photobox && {
      photobox: {
        ...b.photobox,
        layouts: b.photobox.layouts.map((l) => ({ ...l, layout: pick(l.layout) })),
      },
    }),
    assets: { ...b.assets, ...o.assets },
  };
};

/** Aset yang dirujuk layout (overlay, latar, font teks). */
export const assetRefs = (l: LayoutSpec) =>
  [l.overlay?.assetId, l.background?.assetId, ...l.texts.map((t) => t.fontAssetId)].filter(
    (x): x is string => !!x,
  );

/**
 * Simpan satu layout. `files` = aset baru (sudah ditulis ke `local/`). Aset lokal yang tidak dirujuk lagi oleh
 * layout override mana pun dibuang dari daftar dan dikembalikan sebagai `unused` (host menghapus filenya).
 */
export function saveDesign(
  o: DesignOverride,
  layout: LayoutSpec,
  files: Record<string, string>,
  at: string,
): { next: DesignOverride; unused: string[] } {
  const layouts = { ...o.layouts, [layout.id]: layout };
  return prune({
    layouts,
    assets: { ...o.assets, ...files },
    savedAt: { ...o.savedAt, [layout.id]: at },
  });
}

/** Kembalikan ke cloud: satu layout, atau semua (`null`). */
export function resetDesign(
  o: DesignOverride,
  layoutId: string | null,
): { next: DesignOverride; unused: string[] } {
  if (layoutId === null) return { next: EMPTY_DESIGN, unused: Object.values(o.assets) };
  const { [layoutId]: _l, ...layouts } = o.layouts;
  const { [layoutId]: _s, ...savedAt } = o.savedAt;
  return prune({ layouts, assets: o.assets, savedAt });
}

function prune(o: DesignOverride): { next: DesignOverride; unused: string[] } {
  const used = new Set(Object.values(o.layouts).flatMap(assetRefs));
  const keep = Object.entries(o.assets).filter(([id]) => used.has(id));
  const unused = Object.entries(o.assets)
    .filter(([id]) => !used.has(id))
    .map(([, f]) => f);
  return { next: { ...o, assets: Object.fromEntries(keep) }, unused };
}
