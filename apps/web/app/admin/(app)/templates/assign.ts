import "server-only";
import {
  EVENT_PRESETS,
  EventSettingsSchema,
  LAYOUT_PRESETS,
  type PresetId,
  SOUND_CUES,
  StoredBundle,
} from "@tetra/shared";
import {
  type AttractSettings,
  DEFAULT_TEMPLATE,
  type EventBranding,
  type EventTemplate,
} from "@/lib/event-bundle";
import { type PhotoboxSettings, photoboxKey } from "@/lib/payments";
import type { requireMember } from "@/lib/supabase/server";
import { applySettings } from "../events/[id]/settings/actions";

type Db = Awaited<ReturnType<typeof requireMember>>["db"];
const MAX_DESIGNS = 3;

/**
 * "Pasang ke event" dari halaman Template (#160) lewat jalur simpan Pengaturan yang sama (`applySettings`):
 * isian form Pengaturan dibangun ulang dari data event tersimpan (cermin `events/[id]/settings/page.tsx`),
 * lalu hanya desainnya yang diubah. Event: template jadi desain **utama**, desain lain berkertas sama tetap jadi
 * pilihan tamu (maks. 3), yang berkertas beda dilepas. Photobox: template ditambahkan ke desain yang dijual
 * (atau harganya diganti kalau sudah dijual).
 * ponytail: ikut nama field form Pengaturan; field wajib baru di sana = tambahkan di sini (e2e templates menjaga).
 */
export async function assignToEvent(
  db: Db,
  orgId: string,
  layout: { id: string; paper: string },
  eventId: string,
  price?: number,
): Promise<{ ok: boolean; message: string; slug?: string }> {
  const { data: ev } = await db
    .from("events")
    .select(
      "id, slug, name, mode, lead_capture, event_date, location, settings, branding, bundle, all_devices, event_devices(device_id)",
    )
    .eq("id", eventId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!ev) return { ok: false, message: "Event tidak ditemukan" };
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
  const lead = (ev.lead_capture ?? {}) as {
    enabled?: boolean;
    mode?: string;
    fields?: string[];
    consentText?: string;
  };

  // Template aktif (tidak diarsip) + kertasnya: desain yang merujuk template arsip ikut dilepas (seperti Pengaturan).
  const { data: active } = await db
    .from("layouts")
    .select("id, paper")
    .eq("organization_id", orgId)
    .is("archived_at", null);
  const paperOf = new Map((active ?? []).map((l) => [l.id, l.paper]));
  const designPaper = (d: string) =>
    d.startsWith("tpl:")
      ? paperOf.get(d.slice(4))
      : (EVENT_PRESETS as readonly string[]).includes(d)
        ? LAYOUT_PRESETS[d as PresetId].layout.paper
        : undefined;
  const current = [tpl.layoutId ? `tpl:${tpl.layoutId}` : tpl.preset, ...(tpl.extras ?? [])].filter(
    (d) => designPaper(d),
  );
  const mine = `tpl:${layout.id}`;
  const designs =
    ev.mode === "photobox"
      ? current
      : [mine, ...current.filter((d) => d !== mine && designPaper(d) === layout.paper)].slice(
          0,
          MAX_DESIGNS,
        );

  const f = new FormData();
  const set = (k: string, v: string | number | undefined | null) => f.set(k, String(v ?? ""));
  const on = (k: string, v: boolean | undefined) => v && f.set(k, "on");
  set("name", ev.name);
  set("event_date", ev.event_date);
  set("location", ev.location);
  set("tagline", branding.tagline);
  set("client_name", branding.clientName);
  set("background", tpl.background);
  set("guest_color", branding.color ?? "#f8f7f4");
  set("attract_bg", raw.attract?.background ?? "#f8f7f4");
  set("attract_cta", raw.attract?.cta);
  set("attract_brand", raw.attract?.brand);
  on("attract_samples", raw.attract?.samples ?? true);
  for (const k of [
    "countdownSec",
    "retakeMax",
    "maxPrints",
    "reviewTimeoutSec",
    "qrScreenSec",
    "sessionSec",
  ] as const)
    set(k, s[k]);
  on("countdownSound", s.countdownSound);
  on("bumper", s.bumper);
  on("countdownVideo", s.countdownVideo);
  for (const x of s.filters) f.set(`filter_${x}`, "on");
  set("prompts_before", s.promptsBefore.join("\n"));
  set("prompts_after", s.promptsAfter.join("\n"));
  for (const cue of SOUND_CUES) {
    const cfg = bundle.success
      ? (bundle.data.config as { sounds?: Record<string, string> }).sounds?.[cue]
      : undefined;
    on(`snd_on_${cue}`, cfg !== "off");
  }
  set("mode", ev.mode === "photobox" ? "photobox" : "event");
  set("extraPrintPrice", raw.photobox?.extraPrintPrice ?? 10000);
  const sold = new Map(
    (raw.photobox?.layouts ?? [])
      .filter((l) => !("template" in l) || paperOf.has(l.template))
      .filter((l) => !("preset" in l) || (EVENT_PRESETS as readonly string[]).includes(l.preset))
      .map((l) => [photoboxKey(l), l.price]),
  );
  if (ev.mode === "photobox") sold.set(`tpl-${layout.id}`, price ?? 25000);
  for (const [k, p] of sold) {
    f.set(`pb_${k}`, "on");
    set(`price_${k}`, p);
  }
  on("lead_enabled", lead.enabled);
  set("lead_mode", lead.mode ?? "optional");
  for (const k of lead.fields ?? []) f.set(`lead_f_${k}`, "on");
  set("consent_text", lead.consentText);
  set("guest_days", raw.guestDays ?? 30);
  set("client_days", raw.clientDays ?? 90);
  for (const d of designs) f.append("design", d);
  set("deviceScope", ev.all_devices ? "all" : "pick");
  for (const d of ev.event_devices) f.append("devices", d.device_id);

  const r = await applySettings(ev.id, f);
  return r.ok
    ? {
        ok: true,
        slug: r.slug ?? ev.slug,
        message:
          ev.mode === "photobox"
            ? `Dijual di ${ev.name}.`
            : `Jadi desain utama ${ev.name}${designs.length > 1 ? ` (+${designs.length - 1} pilihan tamu)` : ""}.`,
      }
    : { ok: false, message: r.message };
}
