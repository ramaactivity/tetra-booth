import "server-only";
import { createServiceClient } from "./supabase/service";

/** Robot pratinjau link (WA, IG, Telegram, …) dan alat otomatis: bukan klien yang membuka. */
const BOT =
  /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|curl|wget|headless/i;
export const isBot = (ua: string | null) => !ua || BOT.test(ua);

/** Klien membuka galeri (`gallery_open`) atau unduh semua (`zip`) → analytics_events, tampil di ringkasan event. */
export async function trackClient(eventId: string, type: "gallery_open" | "zip") {
  const db = createServiceClient();
  const { data: ev } = await db
    .from("events")
    .select("organization_id")
    .eq("id", eventId)
    .maybeSingle();
  if (ev)
    await db
      .from("analytics_events")
      .insert({ organization_id: ev.organization_id, event_id: eventId, type });
}
