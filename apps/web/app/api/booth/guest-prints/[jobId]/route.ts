import { GuestPrintResult } from "@tetra/shared";
import { z } from "zod";
import { apiError, authDevice, parseBody } from "@/lib/booth";
import { createServiceClient } from "@/lib/supabase/service";

/** Booth melaporkan hasil cetak tamu (#223). Idempoten; hanya booth yang mengambil job ini. */
export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const { jobId } = await ctx.params;
  const body = await parseBody(req, GuestPrintResult);
  if (!z.uuid().safeParse(jobId).success || !body) return apiError("bad_request", 400);
  const { data, error } = await createServiceClient()
    .from("guest_prints")
    .update({
      status: body.status,
      ...(body.status === "printed" && { printed_at: new Date().toISOString() }),
      error: body.error ?? null,
    })
    .eq("id", jobId)
    .eq("organization_id", device.organizationId)
    .eq("device_id", device.id)
    .select("id")
    .maybeSingle();
  if (error) return apiError("server_error", 500);
  if (!data) return apiError("not_found", 404);
  return Response.json({ ok: true });
}
