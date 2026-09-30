import type { BoothEventsResponse } from "@tetra/shared";
import { apiError, authDevice, deviceEvents } from "@/lib/booth";

/** Event untuk device ini (semua booth atau ditugaskan, #127) yang sudah punya bundle (TSD §4.1). */
export async function GET(req: Request) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const events = await deviceEvents(device).catch(() => null);
  if (!events) return apiError("server_error", 500);
  return Response.json({
    events: events
      .filter((e) => e.bundle !== null)
      .map((e) => ({
        id: e.id,
        name: e.name,
        bundleVersion: e.bundle_version,
      })),
  } satisfies BoothEventsResponse);
}
