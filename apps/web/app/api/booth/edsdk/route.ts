import { EdsdkManifest, type EdsdkResponse, SdkKit } from "@tetra/shared";
import { apiError, authDevice } from "@/lib/booth";
import { edsdkPrefix, getStream, presignGet } from "@/lib/r2";

/**
 * DLL SDK kamera + URL bertanda tangan 1 jam, hanya untuk booth yang dipasangkan (DECISIONS #112).
 * `?kit=lumix` = Lumix (#214); tanpa kit = Canon EDSDK (booth lama).
 */
export async function GET(req: Request) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const kit = SdkKit.safeParse(new URL(req.url).searchParams.get("kit") ?? "edsdk");
  if (!kit.success) return apiError("bad_request", 400);
  const prefix = edsdkPrefix(kit.data);
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
