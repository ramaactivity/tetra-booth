import { EventSettingsSchema, LAYOUT_PRESETS, type PresetId, StoredBundle } from "@tetra/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DEFAULT_TEMPLATE, type EventBranding, type EventTemplate } from "@/lib/event-bundle";
import { requireMember } from "@/lib/supabase/server";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

/** Pengaturan event (desain v2 E3) + template sederhana (bagian E4). */
export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const { data: ev } = await db
    .from("events")
    .select("id, name, event_date, location, settings, branding, bundle, event_devices(device_id)")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!ev) notFound();
  const { data: devices } = await db
    .from("devices")
    .select("id, name")
    .eq("organization_id", orgId)
    .is("revoked_at", null)
    .order("short_code");

  const raw = (ev.settings ?? {}) as Record<string, unknown> & {
    template?: EventTemplate;
    guestDays?: number;
    clientDays?: number;
  };
  const s = EventSettingsSchema.parse(raw);
  const tpl =
    raw.template && raw.template.preset in LAYOUT_PRESETS ? raw.template : DEFAULT_TEMPLATE;
  const branding = (ev.branding ?? {}) as EventBranding;
  const bundle = StoredBundle.safeParse(ev.bundle);
  const assigned = new Set(ev.event_devices.map((d) => d.device_id));

  return (
    <>
      <div>
        <Link
          href={`/admin/events/${ev.id}`}
          className="text-[13px] font-semibold text-text-2 no-underline"
        >
          {ev.name} ›
        </Link>
        <h1 className="mt-1 text-[28px] font-extrabold tracking-[-0.03em]">Pengaturan</h1>
      </div>
      <SettingsForm
        eventId={ev.id}
        v={{
          name: ev.name,
          event_date: ev.event_date,
          location: ev.location ?? "",
          tagline: branding.tagline ?? "",
          client_name: branding.clientName ?? "",
          preset: tpl.preset as PresetId,
          background: tpl.background,
          hasOverlay: bundle.success && bundle.data.files.some((f) => f.file === "overlay.png"),
          countdownSec: s.countdownSec,
          retakeMax: s.retakeMax,
          maxPrints: s.maxPrints,
          reviewTimeoutSec: s.reviewTimeoutSec,
          qrScreenSec: s.qrScreenSec,
          guest_days: raw.guestDays ?? 30,
          client_days: raw.clientDays ?? 90,
          devices: (devices ?? []).map((d) => ({ ...d, assigned: assigned.has(d.id) })),
        }}
      />
    </>
  );
}
