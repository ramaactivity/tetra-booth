import { assetFile, SignRequest, type SignResponse } from "@tetra/shared";
import { apiError, authDevice, deviceSession, parseBody, sessionAssetKey } from "@/lib/booth";
import { presignPut } from "@/lib/r2";

/** URL PUT R2 bertanda tangan untuk aset sesi milik device ini (TSD §4.2 langkah 4). */
export async function POST(req: Request) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const body = await parseBody(req, SignRequest);
  if (!body) return apiError("bad_request", 400);
  const session = await deviceSession(device, body.sessionId);
  if (!session) return apiError("not_found", 404);
  const uploads = await Promise.all(
    body.assets.map(async (a) => {
      const key = sessionAssetKey(device, session.event_id, session.id, a.kind, a.idx);
      return { ...a, key, url: await presignPut(key, assetFile(a.kind).contentType) };
    }),
  );
  return Response.json({ uploads } satisfies SignResponse);
}
