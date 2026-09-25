import type { BoothUpdateResponse } from "@tetra/shared";
import { apiError, authDevice } from "@/lib/booth";
import { latestBoothRelease, presignGet } from "@/lib/r2";

/** Versi booth terbaru + URL installer bertanda tangan (mode crew "Update aplikasi", DECISIONS #80). */
export async function GET(req: Request) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const r = await latestBoothRelease();
  if (!r) return apiError("not_found", 404);
  const body: BoothUpdateResponse = { ...r, url: await presignGet(r.key, 2 * 60 * 60) };
  return Response.json(body);
}
