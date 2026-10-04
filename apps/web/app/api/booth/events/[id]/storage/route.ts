import { LocalStorage } from "@tetra/shared";
import { z } from "zod";
import { apiError, authDevice, deviceEvents, parseBody } from "@/lib/booth";
import { saveLocalStorage } from "@/lib/run";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Ukuran folder event di laptop booth (DECISIONS #166), dikirim setiap rekap booth dibuka saat online, supaya
 * event yang timernya tidak pernah jalan tetap punya ukuran. Idempotent: nilai terakhir menang.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const eventId = z.uuid().safeParse((await ctx.params).id).data;
  const body = await parseBody(req, LocalStorage);
  if (!eventId || !body) return apiError("bad_request", 400);
  if (!(await deviceEvents(device, { eventId, includeArchived: true }).catch(() => [])).length)
    return apiError("not_found", 404);
  try {
    await saveLocalStorage(createServiceClient(), eventId, device.organizationId, body);
    return Response.json({ ok: true });
  } catch {
    return apiError("server_error", 500);
  }
}
