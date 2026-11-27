import type { BoothUpdateResponse } from "@tetra/shared";
import { apiError, authDevice } from "@/lib/booth";
import { boothRelease, boothReleases, presignGet } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Versi booth terbaru + URL installer bertanda tangan (mode crew "Update aplikasi", DECISIONS #80).
 * `?channel=stable` = versi stabil pilihan owner, disimpan booth untuk kembali tanpa internet.
 * Rilis bertahap: booth pilot dapat rilis terbaru, booth lain versi "semua booth" (lib/r2 boothReleases).
 */
export async function GET(req: Request) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const stable = new URL(req.url).searchParams.get("channel") === "stable";
  const { data: d } = await createServiceClient()
    .from("devices")
    .select("pilot")
    .eq("id", device.id)
    .maybeSingle();
  const rel = stable ? null : await boothReleases();
  const r = stable ? await boothRelease("stable") : d?.pilot ? rel?.latest : rel?.general;
  if (!r) return apiError("not_found", 404);
  const body: BoothUpdateResponse = {
    ...r,
    url: await presignGet(r.key, 2 * 60 * 60),
    blockmapUrl: r.blockmapKey ? await presignGet(r.blockmapKey, 2 * 60 * 60) : undefined,
  };
  return Response.json(body);
}
