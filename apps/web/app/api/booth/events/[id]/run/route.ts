import { applyRun, BoothRunRequest, runState } from "@tetra/shared";
import { z } from "zod";
import { apiError, authDevice, deviceEvents, parseBody } from "@/lib/booth";
import { saveLocalStorage, updateRun } from "@/lib/run";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Timer event dari booth (DECISIONS #149): Buka untuk Tamu (open), Jeda, Lanjutkan, Selesai. Idempotent lewat
 * `id` aksi (antrean booth mengirim ulang sampai berhasil); `at` = jam laptop saat crew menekan. `local` (finish) =
 * ukuran folder event di laptop (#166).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const eventId = z.uuid().safeParse((await ctx.params).id).data;
  const a = await parseBody(req, BoothRunRequest);
  if (!eventId || !a) return apiError("bad_request", 400);
  if (!(await deviceEvents(device, { eventId, includeArchived: true }).catch(() => [])).length)
    return apiError("not_found", 404);
  try {
    const db = createServiceClient();
    const run = await updateRun(db, eventId, device.organizationId, (r) =>
      applyRun(r, a.action, a.at, Date.now(), a.id),
    );
    if (!run) return apiError("not_found", 404);
    if (a.local) await saveLocalStorage(db, eventId, device.organizationId, a.local);
    return Response.json({ state: runState(run) });
  } catch {
    return apiError("server_error", 500);
  }
}
