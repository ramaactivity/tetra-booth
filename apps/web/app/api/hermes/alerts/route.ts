import { boothAlerts } from "@/lib/alerts";
import { ymdWib } from "@/lib/events";
import { hermesOrg } from "@/lib/hermes";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * Alert booth untuk WA owner (kontrak dengan Hermes, audit 27 Nov): Hermes polling tiap 2 menit, menggabungkan semua
 * alert satu polling jadi satu pesan, lalu POST /api/hermes/alerts/ack. Hanya alert yang masih relevan dan belum
 * di-ack. Jam tenang & ambang ditentukan di sini (lib/alerts.ts).
 */
export async function GET(req: Request) {
  const org = hermesOrg(req);
  if (!org) return Response.json({ error: "unauthorized" }, { status: 401 });
  const db = createServiceClient();
  const now = Date.now();
  const since = ymdWib(now - 30 * 86_400_000);
  const [devices, events, acks] = await Promise.all([
    db
      .from("devices")
      .select("id, name, short_code, last_seen_at, status")
      .eq("organization_id", org)
      .is("revoked_at", null)
      .not("token_hash", "is", null),
    db
      .from("events")
      .select("id, name, event_date, run, client_token, client_expires_at")
      .eq("organization_id", org)
      .neq("status", "archived")
      .gte("event_date", since),
    db
      .from("alert_acks")
      .select("id")
      .eq("organization_id", org)
      .gte("acked_at", `${since}T00:00:00Z`),
  ]);
  if (devices.error || events.error || acks.error)
    return Response.json({ error: "server_error" }, { status: 500 });
  const expiring = (events.data ?? []).filter((e) => e.client_token && e.client_expires_at);
  const { data: opens } = expiring.length
    ? await db
        .from("analytics_events")
        .select("event_id")
        .eq("type", "gallery_open")
        .in(
          "event_id",
          expiring.map((e) => e.id),
        )
    : { data: [] };
  const done = new Set((acks.data ?? []).map((a) => a.id));
  const alerts = boothAlerts(
    devices.data ?? [],
    events.data ?? [],
    now,
    new Set((opens ?? []).map((o) => o.event_id)),
  ).filter((a) => !done.has(a.id));
  return Response.json({ alerts });
}
