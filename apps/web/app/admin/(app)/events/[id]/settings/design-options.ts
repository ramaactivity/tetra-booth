import "server-only";
import { EVENT_PRESETS, LAYOUT_PRESETS, paperLabel } from "@tetra/shared";
import { StoredLayout } from "@/lib/layouts";
import type { requireMember } from "@/lib/supabase/server";
import type { DesignOption } from "./DesignPicker";

type Db = Awaited<ReturnType<typeof requireMember>>["db"];

/**
 * Pilihan desain frame (Pengaturan & wizard Buat event): template editor terbaru dulu, lalu preset.
 * `pinned` = versi yang dikunci event (layoutId → versi). Juga mengembalikan baris template mentah.
 */
export async function loadDesignOptions(
  db: Db,
  orgId: string,
  pinned: Record<string, number | undefined> = {},
) {
  const { data: layouts } = await db
    .from("layouts")
    .select("id, name, paper, layout_versions(version, spec)")
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .order("version", { referencedTable: "layout_versions", ascending: false })
    .limit(1, { referencedTable: "layout_versions" });
  const designOptions: DesignOption[] = [
    ...(layouts ?? []).flatMap((l) => {
      const lv = l.layout_versions[0];
      const spec = StoredLayout.safeParse(lv?.spec);
      if (!lv || !spec.success) return [];
      const { paper, canvas, slots } = spec.data.layout;
      return [
        {
          value: `tpl:${l.id}`,
          name: l.name,
          paper,
          info: `${paperLabel(paper, canvas)} · ${slots.length} foto · v${lv.version}`,
          layout: spec.data.layout,
          template: {
            id: l.id,
            version: lv.version,
            pinned: pinned[l.id] ?? null,
            files: Object.fromEntries(Object.entries(spec.data.files).map(([k, f]) => [k, f.file])),
          },
        },
      ];
    }),
    ...EVENT_PRESETS.map((id) => {
      const { layout } = LAYOUT_PRESETS[id];
      return {
        value: id,
        name: LAYOUT_PRESETS[id].name,
        paper: layout.paper,
        info: `${paperLabel(layout.paper, layout.canvas)} · ${layout.slots.length} foto`,
        layout: { id, version: 1, ...layout },
      };
    }),
  ];
  return { designOptions, layouts: layouts ?? [] };
}
