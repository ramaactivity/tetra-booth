import { SESSION_ID_PATTERN } from "@tetra/shared";
import { z } from "zod";
import { apiError, clientIp, rateOk } from "@/lib/booth";
import { createServiceClient } from "@/lib/supabase/service";

const Body = z.object({ on: z.boolean() });

/**
 * Tamu menyembunyikan / menampilkan lagi fotonya di galeri publik & TV live (audit 27 Nov). Pemegang link /s/{id}
 * adalah pemilik foto (ID acak ±58 bit). Galeri klien & halaman tamu tidak terpengaruh.
 */
export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  if (!(await rateOk(`private:${clientIp(req)}`, 60, 20))) return apiError("rate_limited", 429);
  const id = (await ctx.params).sessionId;
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!SESSION_ID_PATTERN.test(id) || !b.success) return apiError("bad_request", 400);
  const { data, error } = await createServiceClient()
    .from("sessions")
    .update({ private_at: b.data.on ? new Date().toISOString() : null })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) return apiError("server_error", 500);
  if (!data) return apiError("not_found", 404);
  return Response.json({ on: b.data.on });
}
