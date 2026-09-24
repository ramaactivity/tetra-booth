import type { BoothEventsResponse } from "@tetra/shared";
import { apiError, authDevice } from "@/lib/booth";
import { createServiceClient } from "@/lib/supabase/service";

/** Event yang ditugaskan ke device ini dan sudah punya bundle (TSD §4.1). */
export async function GET(req: Request) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const { data, error } = await createServiceClient()
    .from("event_devices")
    .select("events!inner(id, name, bundle_version, status, bundle)")
    .eq("device_id", device.id)
    .eq("organization_id", device.organizationId)
    .eq("events.organization_id", device.organizationId)
    .not("events.bundle", "is", null)
    .neq("events.status", "archived");
  if (error) return apiError("server_error", 500);
  return Response.json({
    events: data.map(({ events: e }) => ({
      id: e.id,
      name: e.name,
      bundleVersion: e.bundle_version,
    })),
  } satisfies BoothEventsResponse);
}
