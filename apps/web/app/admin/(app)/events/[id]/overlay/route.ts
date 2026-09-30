import { StoredBundle } from "@tetra/shared";
import { getStream } from "@/lib/r2";
import { requireMember } from "@/lib/supabase/server";

/** Overlay PNG event (layout preset) lewat origin sendiri: pratinjau desain frame bisa diekspor dari kanvas. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, orgId } = await requireMember();
  const { data } = await db
    .from("events")
    .select("bundle")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  const bundle = StoredBundle.safeParse(data?.bundle);
  const f = bundle.success ? bundle.data.files.find((x) => x.file === "overlay.png") : undefined;
  const body = f && (await getStream(f.key));
  if (!f || !body) return new Response("not found", { status: 404 });
  return new Response(body, {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=60" },
  });
}
