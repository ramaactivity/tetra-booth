import { EventSettingsSchema, LAYOUT_PRESETS, SOUND_CUES, StoredBundle } from "@tetra/shared";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  type AttractSettings,
  DEFAULT_TEMPLATE,
  type EventBranding,
  type EventTemplate,
} from "@/lib/event-bundle";
import type { PhotoboxSettings } from "@/lib/payments";
import { photoboxKey } from "@/lib/payments";
import { presignGet } from "@/lib/r2";
import { requireMember } from "@/lib/supabase/server";
import { LinksPanel } from "./LinksPanel";
import { SettingsForm, type SettingsValues } from "./SettingsForm";

export const dynamic = "force-dynamic";

/** Pengaturan event (desain v2 E3) + template sederhana (bagian E4). */
export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const { data: ev } = await db
    .from("events")
    .select(
      "id, name, mode, lead_capture, event_date, location, settings, branding, bundle, client_token, live_token, event_devices(device_id)",
    )
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
  const { data: layouts } = await db
    .from("layouts")
    .select("id, name, paper, layout_versions(version)")
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .order("version", { referencedTable: "layout_versions", ascending: false })
    .limit(1, { referencedTable: "layout_versions" });

  const raw = (ev.settings ?? {}) as Record<string, unknown> & {
    template?: EventTemplate;
    guestDays?: number;
    clientDays?: number;
    photobox?: PhotoboxSettings;
    attract?: AttractSettings;
  };
  const s = EventSettingsSchema.parse(raw);
  const tpl =
    raw.template && raw.template.preset in LAYOUT_PRESETS ? raw.template : DEFAULT_TEMPLATE;
  const branding = (ev.branding ?? {}) as EventBranding;
  const bundle = StoredBundle.safeParse(ev.bundle);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
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
          guestColor: branding.color ?? "#f8f7f4",
          hasLogo: !!branding.logoKey,
          preset: tpl.layoutId ? `tpl:${tpl.layoutId}` : tpl.preset,
          pinnedVersion: tpl.layoutVersion ?? null,
          extras: tpl.extras ?? [],
          attract: {
            background: raw.attract?.background ?? "#f8f7f4",
            cta: raw.attract?.cta ?? "",
            brand: raw.attract?.brand ?? "",
            samples: raw.attract?.samples ?? true,
            hasImage:
              bundle.success && bundle.data.files.some((f) => f.file.startsWith("attract.")),
          },
          countdownSound: s.countdownSound,
          bumper: s.bumper,
          filters: s.filters,
          promptsBefore: s.promptsBefore,
          promptsAfter: s.promptsAfter,
          sounds: await Promise.all(
            SOUND_CUES.map(async (cue) => {
              const f = bundle.success
                ? bundle.data.files.find((x) => x.file.startsWith(`snd-${cue}.`))
                : undefined;
              const cfg = bundle.success
                ? (bundle.data.config as { sounds?: Record<string, string> }).sounds?.[cue]
                : undefined;
              return {
                cue,
                on: cfg !== "off",
                custom: f ? await presignGet(f.key) : null,
              };
            }),
          ),
          templates: (layouts ?? []).map((l) => ({
            id: l.id,
            name: l.name,
            paper: l.paper,
            version: l.layout_versions[0]?.version ?? 1,
          })),
          background: tpl.background,
          hasOverlay: bundle.success && bundle.data.files.some((f) => f.file === "overlay.png"),
          countdownSec: s.countdownSec,
          retakeMax: s.retakeMax,
          maxPrints: s.maxPrints,
          reviewTimeoutSec: s.reviewTimeoutSec,
          qrScreenSec: s.qrScreenSec,
          mode: ev.mode === "photobox" ? "photobox" : "event",
          sessionSec: s.sessionSec,
          extraPrintPrice: raw.photobox?.extraPrintPrice ?? 10000,
          lead: ev.lead_capture as SettingsValues["lead"],
          prices: Object.fromEntries(
            (raw.photobox?.layouts ?? []).map((l) => [photoboxKey(l), l.price]),
          ),
          guest_days: raw.guestDays ?? 30,
          client_days: raw.clientDays ?? 90,
          devices: (devices ?? []).map((d) => ({ ...d, assigned: assigned.has(d.id) })),
        }}
      />
      <LinksPanel
        eventId={ev.id}
        origin={origin}
        clientToken={ev.client_token}
        liveToken={ev.live_token}
      />
    </>
  );
}
