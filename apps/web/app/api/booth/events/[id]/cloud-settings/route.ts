import { CloudSettingsRequest, newAccessToken } from "@tetra/shared";
import { z } from "zod";
import { apiError, authDevice, deviceMayUseEvent, parseBody } from "@/lib/booth";
import { type CloudRow, cloudSettingsOf, cloudSettingsUpdate } from "@/lib/cloud-settings";
import { freeGuestLink } from "@/lib/guest-link-db";
import { createServiceClient } from "@/lib/supabase/service";

const COLS =
  "slug, client_token, live_token, guest_token, guest_link, settings, lead_capture, promo_off, branding, client_instagram, bundle, bundle_version";

/**
 * Backstage tahap 2 (#295): crew membaca/mengubah setelan cloud event yang ditugaskan ke booth ini — link galeri
 * klien & live, Guest Cam, lead capture, kartu promo, branding halaman tamu. Tanpa `patch` = hanya baca. Harga, mode,
 * nama/tanggal tetap dari admin. Tiap perubahan dicatat di audit log atas nama device.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const eventId = z.uuid().safeParse((await ctx.params).id).data;
  if (!eventId) return apiError("bad_request", 400);
  const body = await parseBody(req, CloudSettingsRequest);
  if (!body) return apiError("bad_request", 400);
  if (!(await deviceMayUseEvent(device, eventId))) return apiError("not_found", 404);
  const db = createServiceClient();
  const read = () =>
    db
      .from("events")
      .select(COLS)
      .eq("id", eventId)
      .eq("organization_id", device.organizationId)
      .maybeSingle<CloudRow>();
  const { data: ev, error } = await read();
  if (error) return apiError("server_error", 500);
  if (!ev) return apiError("not_found", 404);
  const patch = body.patch ?? {};
  if (!Object.keys(patch).length) return Response.json(cloudSettingsOf(ev));

  const needsLink = patch.guestCam === true && !ev.guest_token;
  const guestLink = needsLink ? await freeGuestLink(db, eventId, device.organizationId) : null;
  const { update, error: refused } = cloudSettingsUpdate(ev, patch, {
    token: newAccessToken,
    guestLink,
  });
  // 422 = lead capture belum diatur admin; 409 = setelan baru saja diubah orang lain (baca ulang lalu coba lagi).
  if (refused) return apiError("bad_request", 422);
  // Versi bundle sebagai kunci: simpan admin yang terjadi bersamaan tidak tertimpa diam-diam.
  const { data: saved, error: failed } = await db
    .from("events")
    .update(update)
    .eq("id", eventId)
    .eq("organization_id", device.organizationId)
    .eq("bundle_version", ev.bundle_version)
    .select(COLS)
    .maybeSingle<CloudRow>();
  if (failed) return apiError("server_error", 500);
  if (!saved) return apiError("conflict", 409);
  await db.from("audit_logs").insert({
    organization_id: device.organizationId,
    action: "event.settings.booth",
    target: eventId,
    meta: { device: device.id, patch },
  });
  return Response.json(cloudSettingsOf(saved));
}
