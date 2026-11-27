import type { BoothUpdateResponse } from "@tetra/shared";
import { apiError, authDevice } from "@/lib/booth";
import { boothRelease, presignGet } from "@/lib/r2";

/**
 * Versi booth terbaru + URL installer bertanda tangan (mode crew "Update aplikasi", DECISIONS #80).
 * `?channel=stable` = versi stabil pilihan owner, disimpan booth untuk kembali tanpa internet.
 */
export async function GET(req: Request) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const stable = new URL(req.url).searchParams.get("channel") === "stable";
  const r = await boothRelease(stable ? "stable" : "latest");
  if (!r) return apiError("not_found", 404);
  const body: BoothUpdateResponse = {
    ...r,
    url: await presignGet(r.key, 2 * 60 * 60),
    blockmapUrl: r.blockmapKey ? await presignGet(r.blockmapKey, 2 * 60 * 60) : undefined,
  };
  return Response.json(body);
}
