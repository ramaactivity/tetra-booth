import { StoredLayout } from "@/lib/layouts";
import { getStream } from "@/lib/r2";
import { requireMember } from "@/lib/supabase/server";

const TYPE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  ttf: "font/ttf",
  otf: "font/otf",
  woff2: "font/woff2",
};

/** Aset template versi `?v=` lewat origin sendiri (font butuh CORS kalau langsung dari R2). Anggota organisasi saja. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const { id, assetId } = await params;
  const { db, orgId } = await requireMember();
  const v = Number(new URL(req.url).searchParams.get("v"));
  const { data } = await db
    .from("layout_versions")
    .select("spec")
    .eq("layout_id", id)
    .eq("organization_id", orgId)
    .eq("version", v)
    .maybeSingle();
  const spec = StoredLayout.safeParse(data?.spec);
  const f = spec.success ? spec.data.files[assetId] : undefined;
  const body = f && (await getStream(f.key));
  if (!f || !body) return new Response("not found", { status: 404 });
  return new Response(body, {
    headers: {
      "Content-Type": TYPE[f.file.split(".").pop() ?? ""] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
