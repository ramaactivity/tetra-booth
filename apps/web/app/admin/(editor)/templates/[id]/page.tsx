import { SavedPreset } from "@tetra/shared";
import { notFound } from "next/navigation";
import { StoredLayout } from "@/lib/layouts";
import { requireMember } from "@/lib/supabase/server";
import { EditorHost } from "./EditorHost";

export const dynamic = "force-dynamic";

/** Editor template (desain v2 E4): versi terbaru dibuka, simpan = versi baru. */
export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const { data } = await db
    .from("layout_versions")
    .select("version, spec, created_at, layouts!inner(name, archived_at)")
    .eq("layout_id", id)
    .eq("organization_id", orgId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: presetRows } = await db
    .from("layout_presets")
    .select("id, name, paper, width, height, slots")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  const presets = (presetRows ?? []).flatMap((r) => {
    const p = SavedPreset.safeParse(r);
    return p.success ? [p.data] : [];
  });
  const spec = StoredLayout.safeParse(data?.spec);
  if (!data || !spec.success || data.layouts.archived_at) notFound();
  return (
    <EditorHost
      id={id}
      name={data.layouts.name}
      version={data.version}
      savedAt={data.created_at}
      initial={spec.data.layout}
      presets={presets}
      files={Object.fromEntries(Object.entries(spec.data.files).map(([k, f]) => [k, f.file]))}
    />
  );
}
