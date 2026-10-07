import { type BundleManifest, type EventInfo, hhmm, StoredBundle } from "@tetra/shared";
import { z } from "zod";
import { apiError, authDevice, deviceEvents } from "@/lib/booth";
import { longDate } from "@/lib/guest";
import { presignGet } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase/service";

/** Manifest bundle event (config + file + hash + URL) untuk device yang ditugaskan (TSD §4.1). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return apiError("not_found", 404);
  const found = await deviceEvents(device, { eventId: id }).catch(() => null);
  if (!found) return apiError("server_error", 500);
  if (!found[0]) return apiError("not_found", 404);
  const { data: ev, error } = await createServiceClient()
    .from("events")
    .select(
      "id, name, event_date, bundle_version, bundle, slug, scheduled_start, scheduled_end, package_name, package_hours, public_gallery, live_token",
    )
    .eq("id", id)
    .eq("organization_id", device.organizationId)
    .single();
  if (error) return apiError("server_error", 500);
  const stored = StoredBundle.safeParse(ev.bundle);
  if (!stored.success) return apiError("not_found", 404);
  // Info rekap booth (#154): dibaca saat bundle diunduh; jadwal & paket diubah lewat Simpan Pengaturan (versi naik).
  const start = hhmm(ev.scheduled_start);
  const end = hhmm(ev.scheduled_end);
  const info: EventInfo = {
    ...(start && { scheduledStart: start }),
    ...(end && { scheduledEnd: end }),
    ...(ev.package_name && { packageName: ev.package_name }),
    ...(ev.package_hours && { packageHours: ev.package_hours }),
    slug: ev.slug,
    publicGallery: ev.public_gallery && !!ev.live_token,
  };
  // URL GET bertanda tangan 15 menit (TSD §4.1); r2.dev diblokir ISP Indonesia (DECISIONS #63).
  return Response.json({
    bundleVersion: ev.bundle_version,
    // Nama & tanggal dari baris event bila config tersimpan tidak memuatnya (sync 0.6.7 gagal karena ini).
    config: {
      name: ev.name,
      date: longDate(ev.event_date),
      ...stored.data.config,
      id: ev.id,
      info,
    },
    files: await Promise.all(
      stored.data.files.map(async (f) => ({
        file: f.file,
        sha256: f.sha256,
        url: await presignGet(f.key, 15 * 60),
      })),
    ),
  } satisfies BundleManifest);
}
