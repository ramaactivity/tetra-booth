import { type BundleManifest, StoredBundle } from "@tetra/shared";
import { z } from "zod";
import { apiError, authDevice } from "@/lib/booth";
import { presignGet } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase/service";

/** Manifest bundle event (config + file + hash + URL) untuk device yang ditugaskan (TSD §4.1). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return apiError("not_found", 404);
  const { data, error } = await createServiceClient()
    .from("event_devices")
    .select("events!inner(id, bundle_version, bundle)")
    .eq("device_id", device.id)
    .eq("organization_id", device.organizationId)
    .eq("event_id", id)
    .eq("events.organization_id", device.organizationId)
    .maybeSingle();
  if (error) return apiError("server_error", 500);
  const stored = StoredBundle.safeParse(data?.events.bundle);
  if (!data || !stored.success) return apiError("not_found", 404);
  // URL GET bertanda tangan 15 menit (TSD §4.1); r2.dev diblokir ISP Indonesia (DECISIONS #63).
  return Response.json({
    bundleVersion: data.events.bundle_version,
    config: { ...stored.data.config, id: data.events.id },
    files: await Promise.all(
      stored.data.files.map(async (f) => ({
        file: f.file,
        sha256: f.sha256,
        url: await presignGet(f.key, 15 * 60),
      })),
    ),
  } satisfies BundleManifest);
}
