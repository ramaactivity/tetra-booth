import type { Json } from "@tetra/db";
import { LAYOUT_PRESETS, LayoutSpecSchema, SavedPreset } from "@tetra/shared";
import { z } from "zod";
import type { requireMember } from "@/lib/supabase/server";

/**
 * Template buatan admin (editor E4, DECISIONS #74). `layout_versions.spec` = layout + file aset (R2) per assetId.
 * Versi tidak pernah diubah; simpan = versi baru. Event mengunci versi saat pengaturannya disimpan.
 */
export const StoredLayout = z.object({
  layout: LayoutSpecSchema,
  files: z.record(z.string(), z.object({ file: z.string(), sha256: z.string(), key: z.string() })),
});
export type StoredLayout = z.infer<typeof StoredLayout>;
export type TemplateMode = "event" | "photobox";

type Db = Awaited<ReturnType<typeof requireMember>>["db"];

/**
 * Template baru (versi 1) dari preset, "Tata letak saya" (`lp:<id>`, slot saja di atas preset berkanvas sama),
 * atau versi terbaru template lain (`tpl:<id>`): tombol Duplikat, wizard Buat Template, & "Salin & sesuaikan". Aset R2 template immutable & berbasis hash (`<org>/layouts/<id>/<sha256>.<ext>`, tidak
 * pernah dihapus, arsip hanya menandai), jadi salinan memakai kunci yang sama tanpa menyalin objek.
 * `name` menerima nama sumber. `mode` kosong = mode template sumber (preset: event, #160).
 * Hasil: id template baru, atau null kalau sumber tidak ada / gagal.
 */
export async function copyLayout(
  db: Db,
  orgId: string,
  source: string,
  name: (sourceName: string) => string,
  mode?: TemplateMode,
): Promise<string | null> {
  let src: { name: string; spec: StoredLayout; mode?: string } | null = null;
  if (source.startsWith("tpl:")) {
    const { data } = await db
      .from("layout_versions")
      .select("spec, layouts!inner(name, mode)")
      .eq("layout_id", source.slice(4))
      .eq("organization_id", orgId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const spec = StoredLayout.safeParse(data?.spec);
    if (data && spec.success)
      src = { name: data.layouts.name, spec: spec.data, mode: data.layouts.mode };
  } else if (source.startsWith("lp:")) {
    const { data } = await db
      .from("layout_presets")
      .select("id, name, paper, width, height, slots")
      .eq("id", source.slice(3))
      .eq("organization_id", orgId)
      .maybeSingle();
    const p = SavedPreset.safeParse(data);
    const base =
      p.success &&
      Object.values(LAYOUT_PRESETS).find(
        (b) =>
          b.layout.paper === p.data.paper &&
          b.layout.canvas.width === p.data.width &&
          b.layout.canvas.height === p.data.height,
      );
    if (p.success && base) {
      const layout = { id: "x", version: 1, ...base.layout, slots: p.data.slots };
      src = {
        name: p.data.name,
        spec: { layout: { ...layout, background: { color: "#ffffff" } }, files: {} },
      };
    }
  } else if (source in LAYOUT_PRESETS) {
    const p = LAYOUT_PRESETS[source as keyof typeof LAYOUT_PRESETS];
    const layout = { id: "x", version: 1, ...p.layout, background: { color: "#ffffff" } };
    src = { name: p.name, spec: { layout, files: {} } };
  }
  if (!src) return null;
  const { data: l } = await db
    .from("layouts")
    .insert({
      organization_id: orgId,
      name: name(src.name).trim().slice(0, 80),
      paper: src.spec.layout.paper,
      mode: mode ?? (src.mode === "photobox" ? "photobox" : "event"),
    })
    .select("id")
    .single();
  if (!l) return null;
  const spec: StoredLayout = { ...src.spec, layout: { ...src.spec.layout, id: l.id, version: 1 } };
  const { error } = await db.from("layout_versions").insert({
    organization_id: orgId,
    layout_id: l.id,
    version: 1,
    spec: spec as unknown as NonNullable<Json>,
  });
  if (error) {
    await db.from("layouts").delete().eq("id", l.id).eq("organization_id", orgId);
    return null;
  }
  return l.id;
}
