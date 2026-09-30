import type { Json } from "@tetra/db";
import { LAYOUT_PRESETS, LayoutSpecSchema } from "@tetra/shared";
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

type Db = Awaited<ReturnType<typeof requireMember>>["db"];

/**
 * Template baru (versi 1) dari preset atau dari versi terbaru template lain (`tpl:<id>`): tombol Duplikat &
 * "Salin & sesuaikan". Aset R2 template immutable & berbasis hash (`<org>/layouts/<id>/<sha256>.<ext>`, tidak
 * pernah dihapus, arsip hanya menandai), jadi salinan memakai kunci yang sama tanpa menyalin objek.
 * `name` menerima nama sumber. Hasil: id template baru, atau null kalau sumber tidak ada / gagal.
 */
export async function copyLayout(
  db: Db,
  orgId: string,
  source: string,
  name: (sourceName: string) => string,
): Promise<string | null> {
  let src: { name: string; spec: StoredLayout } | null = null;
  if (source.startsWith("tpl:")) {
    const { data } = await db
      .from("layout_versions")
      .select("spec, layouts!inner(name)")
      .eq("layout_id", source.slice(4))
      .eq("organization_id", orgId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const spec = StoredLayout.safeParse(data?.spec);
    if (data && spec.success) src = { name: data.layouts.name, spec: spec.data };
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
