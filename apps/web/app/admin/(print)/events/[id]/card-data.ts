import "server-only";
import { EventSettingsSchema } from "@tetra/shared";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { eventKey } from "@/lib/events";
import type { CardData } from "@/lib/guest-card-art";
import { requireMember } from "@/lib/supabase/server";

/** Data kartu QR Snapbook (#230) untuk halaman cetak; 404 kalau link Guest Cam belum dibuat. */
export async function loadCardEvent(id: string) {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const { data: ev } = await db
    .from("events")
    .select("name, event_date, settings, guest_token")
    .eq(eventKey(id), id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!ev?.guest_token) notFound();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const cam = EventSettingsSchema.parse(ev.settings ?? {}).guestCam;
  const data: CardData = {
    name: ev.name,
    date: ev.event_date,
    url: `${origin}/c/${ev.guest_token}`,
    shots: cam.shots,
    voice: cam.voice,
    strip: cam.strip,
  };
  return { data, design: cam.cardDesign };
}
