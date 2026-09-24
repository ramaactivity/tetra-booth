import type { Json } from "@tetra/db";
import { HeartbeatRequest } from "@tetra/shared";
import { apiError, authDevice, parseBody } from "@/lib/booth";
import { createServiceClient } from "@/lib/supabase/service";

/** Status booth tiap 60 detik saat online (TSD §10) → devices.status & last_seen_at. */
export async function POST(req: Request) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const body = await parseBody(req, HeartbeatRequest);
  if (!body) return apiError("bad_request", 400);
  const { error } = await createServiceClient()
    .from("devices")
    .update({
      app_version: body.appVersion,
      screen_width: body.screen?.width ?? null,
      screen_height: body.screen?.height ?? null,
      status: body.status as { [k: string]: Json },
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", device.id)
    .eq("organization_id", device.organizationId);
  if (error) return apiError("server_error", 500);
  return Response.json({ ok: true });
}
