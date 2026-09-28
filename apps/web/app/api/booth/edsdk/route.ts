import { EdsdkManifest, type EdsdkResponse } from "@tetra/shared";
import { apiError, authDevice } from "@/lib/booth";
import { edsdkPrefix, getStream, presignGet } from "@/lib/r2";

/** DLL Canon EDSDK + URL bertanda tangan 1 jam, hanya untuk booth yang dipasangkan (DECISIONS #112). */
export async function GET(req: Request) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const prefix = edsdkPrefix();
  const stream = await getStream(`${prefix}manifest.json`).catch(() => undefined);
  const m = stream
    ? EdsdkManifest.safeParse(await new Response(stream).json().catch(() => null))
    : null;
  if (!m?.success) return apiError("not_found", 404);
  const body: EdsdkResponse = {
    version: m.data.version,
    files: await Promise.all(
      m.data.files.map(async (f) => ({
        ...f,
        url: await presignGet(`${prefix}${f.name}`, 60 * 60),
      })),
    ),
  };
  return Response.json(body);
}
