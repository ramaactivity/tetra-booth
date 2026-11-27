import { type GalleryLinkResponse, newAccessToken } from "@tetra/shared";
import { z } from "zod";
import { apiError, authDevice, deviceMayUseEvent } from "@/lib/booth";
import { clientPath } from "@/lib/guest-link";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * "Salin link galeri" dari rekap booth (#155): aktifkan link galeri klien (/g/<slug>) event yang ditugaskan ke
 * booth ini kalau belum aktif, lalu balas slug-nya. Idempotent: link yang sudah aktif tidak diganti tokennya.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const eventId = z.uuid().safeParse((await ctx.params).id).data;
  if (!eventId) return apiError("bad_request", 400);
  if (!(await deviceMayUseEvent(device, eventId))) return apiError("not_found", 404);
  const db = createServiceClient();
  const { data: ev } = await db
    .from("events")
    .select("slug, client_token")
    .eq("id", eventId)
    .eq("organization_id", device.organizationId)
    .maybeSingle();
  if (!ev) return apiError("not_found", 404);
  let token = ev.client_token;
  if (!token) {
    token = newAccessToken();
    const { error } = await db
      .from("events")
      .update({ client_token: token })
      .eq("id", eventId)
      .eq("organization_id", device.organizationId)
      .is("client_token", null);
    if (error) return apiError("server_error", 500);
    await db.from("audit_logs").insert({
      organization_id: device.organizationId,
      action: "link.client.new",
      target: eventId,
      meta: { device: device.id },
    });
  }
  // Simpan bersamaan dari tempat lain (update di atas tidak kena): pakai token yang benar-benar tersimpan.
  const { data: saved } = await db
    .from("events")
    .select("client_token")
    .eq("id", eventId)
    .maybeSingle();
  token = saved?.client_token ?? token;
  // `slug` = segmen path galeri klien (sekarang `<slug>-<kode>`, audit 27 Nov); booth lama tetap membentuk /g/<slug>.
  return Response.json({
    slug: clientPath({ slug: ev.slug, client_token: token }),
  } satisfies GalleryLinkResponse);
}
