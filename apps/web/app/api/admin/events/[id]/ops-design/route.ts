import { z } from "zod";
import { requireMember } from "@/lib/supabase/server";
import { approvedDesign, opsBookingNow } from "@/lib/tetra-ops";

/** Batas unggah desain di Ops (kontrak §2.3). */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * PNG desain yang di-ACC di Tetra Ops untuk event ini (#177), lewat server: signed URL Ops tidak pernah sampai ke
 * browser dan kedaluwarsa 7 hari, jadi selalu diambil segar dari GET /api/booth/bookings. Owner/admin.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const id = z.uuid().safeParse((await ctx.params).id).data;
  if (!id) return new Response("bad request", { status: 400 });
  const { data: ev } = await db
    .from("events")
    .select("name, event_date, ops_project_id")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!ev) return new Response("not found", { status: 404 });
  const design = approvedDesign((await opsBookingNow(ev))?.booking, ev.name);
  if (!design) return new Response("no design", { status: 404 });
  const res = await fetch(design.frameUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const len = Number(res.headers.get("content-length") ?? 0);
  if (!res.ok || len > MAX_BYTES) return new Response("bad gateway", { status: 502 });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES || bytes[0] !== 0x89 || bytes[1] !== 0x50)
    return new Response("bad gateway", { status: 502 });
  return new Response(bytes, {
    headers: { "content-type": "image/png", "cache-control": "private, no-store" },
  });
}
