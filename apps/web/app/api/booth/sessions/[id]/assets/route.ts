import { AssetsRequest, type AssetsResponse } from "@tetra/shared";
import { apiError, authDevice, deviceSession, parseBody, sessionAssetKey } from "@/lib/booth";
import { createServiceClient } from "@/lib/supabase/service";

/** Catat aset yang sudah masuk R2 (TSD §4.2 langkah 6). Idempotent per key; semua tercatat → complete. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const body = await parseBody(req, AssetsRequest);
  if (!body) return apiError("bad_request", 400);
  const session = await deviceSession(device, (await ctx.params).id);
  if (!session) return apiError("not_found", 404);
  const db = createServiceClient();
  const { error } = await db.from("assets").upsert(
    body.assets.map((a) => ({
      organization_id: device.organizationId,
      session_id: session.id,
      kind: a.kind,
      idx: a.idx,
      bytes: a.bytes,
      r2_key: sessionAssetKey(device, session.event_id, session.id, a.kind, a.idx),
    })),
    { onConflict: "r2_key" },
  );
  if (error) return apiError("server_error", 500);
  const { count } = await db
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session.id)
    .eq("organization_id", device.organizationId);
  const uploadStatus = (count ?? 0) >= (session.asset_count ?? Infinity) ? "complete" : "partial";
  const { error: e2 } = await db
    .from("sessions")
    .update({ upload_status: uploadStatus })
    .eq("id", session.id)
    .eq("organization_id", device.organizationId);
  if (e2) return apiError("server_error", 500);
  return Response.json({ uploadStatus } satisfies AssetsResponse);
}
