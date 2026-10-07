import { EventSettingsSchema } from "@tetra/shared";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { eventKey } from "@/lib/events";
import { requireMember } from "@/lib/supabase/server";
import { GuestCard } from "./GuestCard";

/** B11 Kartu QR meja Guest Cam (A6 105×148 mm, #203): `?v=wedding|corporate`. Cetak / simpan PDF dari browser. */
export default async function GuestCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const { id } = await params;
  const { data: ev } = await db
    .from("events")
    .select("name, event_date, branding, settings, guest_token")
    .eq(eventKey(id), id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!ev?.guest_token) notFound();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const cam = EventSettingsSchema.parse(ev.settings ?? {}).guestCam;
  const branding = (ev.branding ?? {}) as { tagline?: string };
  return (
    <GuestCard
      variant={(await searchParams).v === "corporate" ? "corporate" : "wedding"}
      name={ev.name}
      date={ev.event_date}
      tagline={branding.tagline ?? null}
      url={`${origin}/c/${ev.guest_token}`}
      shots={cam.shots}
      reveal={cam.reveal}
      approval={cam.approval}
    />
  );
}
