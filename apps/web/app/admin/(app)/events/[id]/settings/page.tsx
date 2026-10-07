import { EventSettingsSchema, LAYOUT_PRESETS, SOUND_CUES, StoredBundle } from "@tetra/shared";
import { ChevronLeft } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  type AttractSettings,
  DEFAULT_TEMPLATE,
  type EventBranding,
  type EventTemplate,
} from "@/lib/event-bundle";
import { eventKey } from "@/lib/events";
import type { PhotoboxSettings } from "@/lib/payments";
import { photoboxKey } from "@/lib/payments";
import { presignGet } from "@/lib/r2";
import { requireMember } from "@/lib/supabase/server";
import { opsBookingNow } from "@/lib/tetra-ops";
import { loadDesignOptions } from "./design-options";
import { GuestLinkPanel } from "./GuestLinkPanel";
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
      "id, slug, name, mode, lead_capture, event_date, location, settings, branding, bundle, client_token, live_token, guest_token, all_devices, package_name, package_hours, ops_frame_size, scheduled_start, scheduled_end, ops_project_id, event_devices(device_id)",
    )
    .eq(eventKey(id), id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!ev) notFound();
  if (id !== ev.slug) redirect(`/admin/events/${ev.slug}/settings`);
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
  const pinned = { ...tpl.versions, ...(tpl.layoutId && { [tpl.layoutId]: tpl.layoutVersion }) };
  const { designOptions, layouts } = await loadDesignOptions(db, orgId, pinned);
  const known = new Set(designOptions.map((o) => o.value));
  // #182: daftar grup kosong → usulkan daftar yang diisi klien/WO di portal Ops (admin tetap menyimpan sendiri).
  const opsGroups =
    ev.mode === "event" && !s.stageGroups.length
      ? ((await opsBookingNow(ev))?.booking?.stage_groups?.filter(Boolean) ?? [])
      : [];

  return (
    <>
      <div>
        <Link
          href={`/admin/events/${ev.slug}`}
          className="-ml-1 inline-flex items-center gap-0.5 text-[13px] font-semibold text-text-2 no-underline hover:text-ink"
        >
          <ChevronLeft aria-hidden className="size-4" strokeWidth={2} />
          {ev.name}
        </Link>
        <h1 className="mt-1 text-[28px] font-extrabold tracking-[-0.03em]">Pengaturan</h1>
      </div>
      <SettingsForm
        eventId={ev.id}
        slug={ev.slug}
        v={{
          name: ev.name,
          opsFrameSize: ev.ops_frame_size,
          event_date: ev.event_date,
          location: ev.location ?? "",
          tagline: branding.tagline ?? "",
          client_name: branding.clientName ?? "",
          package_name: ev.package_name ?? "",
          opsProjectId: ev.ops_project_id ?? "",
          package_hours: ev.package_hours ? String(ev.package_hours) : "",
          scheduled_start: ev.scheduled_start?.slice(0, 5) ?? "",
          scheduled_end: ev.scheduled_end?.slice(0, 5) ?? "",
          guestColor: branding.color ?? "#f8f7f4",
          hasLogo: !!branding.logoKey,
          // Template yang sudah diarsip tidak ada di pilihan: tidak ikut terpilih.
          designs: [
            tpl.layoutId ? `tpl:${tpl.layoutId}` : tpl.preset,
            ...(tpl.extras ?? []),
          ].filter((d) => known.has(d)),
          designOptions,
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
          countdownVideo: s.countdownVideo,
          pairDifferent: s.pairDifferent,
          filters: s.filters,
          promptsBefore: s.promptsBefore,
          promptsAfter: s.promptsAfter,
          stageGroups: s.stageGroups,
          stageGapSec: s.stageGapSec,
          stageTvSec: s.stageTvSec,
          guestCam: s.guestCam,
          gc_shots: s.guestCam.shots,
          opsStageGroups: opsGroups,
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
          templates: layouts.map((l) => ({
            id: l.id,
            name: l.name,
            paper: l.paper,
            mode: l.mode,
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
          allDevices: ev.all_devices,
          hasClientLink: !!ev.client_token,
        }}
        guestLinks={<GuestLinkPanel eventId={ev.id} origin={origin} token={ev.guest_token} />}
        links={
          <LinksPanel
            eventId={ev.id}
            origin={origin}
            slug={ev.slug}
            clientOn={!!ev.client_token}
            liveOn={!!ev.live_token}
          />
        }
      />
    </>
  );
}
