import { type GuestPrintJob, LayoutPaperSchema } from "@tetra/shared";
import { z } from "zod";
import { apiError, authDevice, deviceMayUseEvent, parseBody } from "@/lib/booth";
import { presignGet } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase/service";

const Body = z.object({ paper: LayoutPaperSchema });

/**
 * Booth mengambil cetak tamu Guest Cam berikutnya (#223) untuk kertas yang terpasang di printernya. Atomik antar
 * booth; kertas setengah lembar dipasangkan dua tamu per lembar. Kosong = `{ jobs: [] }`.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success || !(await deviceMayUseEvent(device, id)))
    return apiError("not_found", 404);
  const body = await parseBody(req, Body);
  if (!body) return apiError("bad_request", 400);
  const { data, error } = await createServiceClient().rpc("claim_guest_prints", {
    p_event: id,
    p_device: device.id,
    p_paper: body.paper,
  });
  if (error) return apiError("server_error", 500);
  const jobs: GuestPrintJob[] = await Promise.all(
    (data ?? []).map(async (j) => ({
      id: j.id,
      number: j.number,
      guestName: j.guest_name,
      paper: j.paper,
      layout: j.layout,
      url: await presignGet(j.r2_key.split("#")[0] ?? j.r2_key, 15 * 60),
    })),
  );
  return Response.json({ jobs });
}
