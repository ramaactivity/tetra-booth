import { type BundleManifest, StoredBundle } from "@tetra/shared";
import { z } from "zod";
import { apiError, authDevice, deviceEvents } from "@/lib/booth";
import { presignGet } from "@/lib/r2";

/** Manifest bundle event (config + file + hash + URL) untuk device yang ditugaskan (TSD §4.1). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return apiError("not_found", 404);
  const found = await deviceEvents(device, id).catch(() => null);
  if (!found) return apiError("server_error", 500);
  const ev = found[0];
  const stored = StoredBundle.safeParse(ev?.bundle);
  if (!ev || !stored.success) return apiError("not_found", 404);
  // URL GET bertanda tangan 15 menit (TSD §4.1); r2.dev diblokir ISP Indonesia (DECISIONS #63).
  return Response.json({
    bundleVersion: ev.bundle_version,
    config: { ...stored.data.config, id: ev.id },
    files: await Promise.all(
      stored.data.files.map(async (f) => ({
        file: f.file,
        sha256: f.sha256,
        url: await presignGet(f.key, 15 * 60),
      })),
    ),
  } satisfies BundleManifest);
}
