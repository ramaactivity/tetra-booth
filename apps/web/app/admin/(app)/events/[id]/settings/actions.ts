"use server";
import { createHash } from "node:crypto";
import {
  EVENT_PRESETS,
  LAYOUT_PRESETS,
  PHOTO_FILTERS,
  type PresetId,
  SOUND_CUES,
  type SoundCue,
  StoredBundle,
} from "@tetra/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  type AttractSettings,
  buildBundle,
  type EventBranding,
  type EventTemplate,
  type ExtraDesign,
  type SoundSetting,
  storeBundleFile,
  storeOverlay,
} from "@/lib/event-bundle";
import { StoredLayout } from "@/lib/layouts";
import { consentVersion, LEAD_FIELDS } from "@/lib/leads";
import type { PhotoboxLayoutSetting, PhotoboxSettings } from "@/lib/payments";
import { putObject } from "@/lib/r2";
import { requireMember } from "@/lib/supabase/server";

const DAY = 86_400_000;
const MAX_OVERLAY = 4 * 1024 * 1024;
const MAX_LOGO = 1024 * 1024;
/** Latar layar awal (#102/#115): gambar, GIF, atau video loop. */
const ATTRACT_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};
/** Tanpa SVG: logo ditampilkan di halaman publik. */
const LOGO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
/** Warna header bawaan (--paper) = tanpa warna khusus. */
const PAPER = "#f8f7f4";
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
/** Minimal nominal QRIS Xendit. */
const MIN_PRICE = 1500;

const Design = z.union([z.enum(EVENT_PRESETS), z.string().regex(/^tpl:[0-9a-f-]{36}$/)]);
/** Mode event: maks. 4 desain tambahan → total 5 pilihan untuk tamu (DECISIONS #99). */
const MAX_EXTRAS = 4;

const Form = z.object({
  name: z.string().trim().min(1).max(120),
  event_date: z.iso.date(),
  location: z.string().trim().max(120),
  tagline: z.string().trim().max(40),
  client_name: z.string().trim().max(120),
  /** Preset, atau `tpl:<layoutId>` = template editor (versi terbaru dikunci saat simpan). */
  preset: Design,
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  guest_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  attract_bg: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  attract_cta: z.string().trim().max(30),
  attract_brand: z.string().trim().max(40),
  countdownSec: int(1, 10),
  retakeMax: int(0, 5),
  maxPrints: int(1, 10),
  reviewTimeoutSec: int(5, 120),
  qrScreenSec: int(10, 300),
  mode: z.enum(["event", "photobox"]),
  lead_mode: z.enum(["gate", "optional"]),
  consent_text: z.string().trim().max(600),
  sessionSec: int(60, 900),
  extraPrintPrice: int(0, 1_000_000),
  guest_days: int(1, 365),
  client_days: int(1, 365),
});

/** Textarea kalimat (#103): satu per baris, maks. 10 baris × 40 karakter. */
const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split("\n")
    .map((l) => l.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 10);

export type SaveResult = { ok: boolean; message: string } | null;

/**
 * Simpan pengaturan event (E3) + template (preset, latar, overlay) → bundle baru (bundle_version + 1) →
 * booth menarik versi baru saat online. Penugasan device diganti sesuai centang.
 */
export async function saveEvent(
  eventId: string,
  _prev: SaveResult,
  form: FormData,
): Promise<SaveResult> {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const p = Form.safeParse(Object.fromEntries(form));
  if (!p.success) return { ok: false, message: "Periksa lagi isian yang ditandai" };
  const f = p.data;
  const { data: ev } = await db
    .from("events")
    .select("id, bundle, bundle_version, branding")
    .eq("id", eventId)
    .eq("organization_id", orgId)
    .single();
  if (!ev) return { ok: false, message: "Event tidak ditemukan" };

  const prev = StoredBundle.safeParse(ev.bundle);
  let overlay = prev.success
    ? (prev.data.files.find((x) => x.file === "overlay.png") ?? null)
    : null;
  const file = form.get("overlay");
  if (file instanceof File && file.size > 0) {
    if (file.type !== "image/png") return { ok: false, message: "Overlay harus PNG transparan" };
    if (file.size > MAX_OVERLAY) return { ok: false, message: "Overlay maksimal 4 MB" };
    overlay = await storeOverlay(orgId, eventId, new Uint8Array(await file.arrayBuffer()));
  } else if (form.get("remove_overlay") === "on") overlay = null;

  // Gambar latar layar awal (#102): JPG/PNG ≤ 4 MB, file bundle attract.<ext>.
  let attractImage = prev.success
    ? (prev.data.files.find((x) => x.file.startsWith("attract.")) ?? null)
    : null;
  const bgFile = form.get("attract_image");
  if (bgFile instanceof File && bgFile.size > 0) {
    const ext = ATTRACT_EXT[bgFile.type];
    if (!ext) return { ok: false, message: "Latar layar awal harus JPG, PNG, GIF, MP4, atau WebM" };
    // ponytail: batas request Vercel 4,5 MB; video lebih besar butuh unggah langsung ke R2 (URL bertanda tangan).
    if (bgFile.size > MAX_OVERLAY)
      return { ok: false, message: "Latar layar awal maksimal 4 MB (kompres video ±10 dtk 720p)" };
    const bytes = new Uint8Array(await bgFile.arrayBuffer());
    attractImage = await storeBundleFile(orgId, eventId, bytes, `attract.${ext}`, bgFile.type);
  } else if (form.get("remove_attract_image") === "on") attractImage = null;
  // Suara per event (#104): mati, atau file pengganti WAV/MP3 ≤ 1 MB (file bundle snd-<cue>.<ext>).
  const sounds: Partial<Record<SoundCue, SoundSetting>> = {};
  for (const cue of SOUND_CUES) {
    const old = prev.success
      ? prev.data.files.find((x) => x.file.startsWith(`snd-${cue}.`))
      : undefined;
    const up = form.get(`snd_file_${cue}`);
    let file = form.get(`snd_reset_${cue}`) === "on" ? undefined : old;
    if (up instanceof File && up.size > 0) {
      const ext = /wav/.test(up.type) ? "wav" : /mpeg|mp3/.test(up.type) ? "mp3" : null;
      if (!ext) return { ok: false, message: `Suara "${cue}" harus WAV atau MP3` };
      if (up.size > MAX_LOGO) return { ok: false, message: `Suara "${cue}" maksimal 1 MB` };
      const bytes = new Uint8Array(await up.arrayBuffer());
      file = await storeBundleFile(orgId, eventId, bytes, `snd-${cue}.${ext}`, up.type);
    }
    // Mati tetap menyimpan file pengganti, supaya menyalakan lagi tidak perlu upload ulang.
    if (form.get(`snd_on_${cue}`) !== "on") sounds[cue] = file ? { off: true, file } : "off";
    else if (file) sounds[cue] = file;
  }
  const attract: AttractSettings = {
    ...(f.attract_bg.toLowerCase() !== PAPER ? { background: f.attract_bg } : {}),
    ...(f.attract_cta ? { cta: f.attract_cta } : {}),
    ...(f.attract_brand ? { brand: f.attract_brand } : {}),
    samples: form.get("attract_samples") === "on",
  };

  // Logo halaman tamu: kunci berbasis hash di folder event (ikut terhapus saat retensi).
  let logoKey = (ev.branding as EventBranding | null)?.logoKey;
  const logo = form.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const ext = LOGO_EXT[logo.type];
    if (!ext) return { ok: false, message: "Logo harus PNG, JPG, atau WebP" };
    if (logo.size > MAX_LOGO) return { ok: false, message: "Logo maksimal 1 MB" };
    const bytes = new Uint8Array(await logo.arrayBuffer());
    logoKey = `${orgId}/${eventId}/branding/${createHash("sha256").update(bytes).digest("hex")}.${ext}`;
    await putObject(logoKey, bytes, logo.type);
  } else if (form.get("remove_logo") === "on") logoKey = undefined;

  // Photobox (E3, DECISIONS #70/#108): tiap preset / template editor yang dicentang dijual dengan harganya sendiri.
  const layouts: PhotoboxLayoutSetting[] = [...form.keys()]
    .filter((k) => k.startsWith("pb_") && form.get(k) === "on")
    .map((k) => k.slice(3))
    .flatMap((key): PhotoboxLayoutSetting[] => {
      const price = Number(form.get(`price_${key}`));
      if ((EVENT_PRESETS as readonly string[]).includes(key))
        return [{ preset: key as PresetId, price }];
      const t = /^tpl-([0-9a-f-]{36})$/.exec(key)?.[1];
      return t ? [{ template: t, price }] : [];
    });
  if (
    layouts.some((l) => !Number.isInteger(l.price) || l.price < MIN_PRICE || l.price > 10_000_000)
  )
    return { ok: false, message: `Harga layout minimal Rp ${MIN_PRICE.toLocaleString("id-ID")}` };
  if (f.mode === "photobox" && !layouts.length)
    return { ok: false, message: "Mode photobox: centang minimal satu layout yang dijual" };
  const photobox: PhotoboxSettings = { layouts, extraPrintPrice: f.extraPrintPrice };

  // Lead capture (FSD §2, DECISIONS #71): versi persetujuan = hash teks, berubah otomatis saat teks diubah.
  const leadOn = form.get("lead_enabled") === "on";
  const leadFields = LEAD_FIELDS.filter((k) => form.get(`lead_f_${k}`) === "on");
  if (leadOn && (!leadFields.length || !f.consent_text))
    return {
      ok: false,
      message: "Lead capture: pilih minimal satu field dan isi teks persetujuan",
    };
  const lead_capture = {
    enabled: leadOn,
    mode: f.lead_mode,
    fields: leadFields,
    consentText: f.consent_text,
    consentVersion: consentVersion(f.consent_text),
  };

  const settings = {
    sessionSec: f.sessionSec,
    countdownSec: f.countdownSec,
    retakeMax: f.retakeMax,
    maxPrints: f.maxPrints,
    reviewTimeoutSec: f.reviewTimeoutSec,
    qrScreenSec: f.qrScreenSec,
    countdownSound: form.get("countdownSound") === "on",
    bumper: form.get("bumper") === "on",
    countdownVideo: form.get("countdownVideo") === "on",
    // Filter pilihan tamu (#116): tanpa centang = langkah filter dilewati.
    filters: PHOTO_FILTERS.filter(
      (x) => x.id !== "normal" && form.get(`filter_${x.id}`) === "on",
    ).map((x) => x.id),
    promptsBefore: lines(form.get("prompts_before")),
    promptsAfter: lines(form.get("prompts_after")),
  };
  /** Versi terbaru template editor (dikunci ke event saat simpan). */
  const latest = async (layoutId: string) => {
    const { data: lv } = await db
      .from("layout_versions")
      .select("version, spec, layouts!inner(archived_at, name)")
      .eq("layout_id", layoutId)
      .eq("organization_id", orgId)
      .is("layouts.archived_at", null)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const parsed = StoredLayout.safeParse(lv?.spec);
    return lv && parsed.success
      ? { version: lv.version, name: lv.layouts.name, custom: parsed.data }
      : null;
  };
  let custom: StoredLayout | null = null;
  let customName: string | undefined;
  const extraValues = [...new Set(form.getAll("extra").map(String))].filter((x) => x !== f.preset);
  const extrasParsed = z.array(Design).max(MAX_EXTRAS).safeParse(extraValues);
  if (!extrasParsed.success)
    return { ok: false, message: `Desain tambahan maksimal ${MAX_EXTRAS}` };
  let template: EventTemplate = {
    preset: f.preset in LAYOUT_PRESETS ? (f.preset as PresetId) : "strip-3",
    background: f.background,
    ...(extrasParsed.data.length && { extras: extrasParsed.data }),
  };
  if (f.preset.startsWith("tpl:")) {
    const layoutId = f.preset.slice(4);
    const lv = await latest(layoutId);
    if (!lv) return { ok: false, message: "Template tidak ditemukan" };
    custom = lv.custom;
    customName = lv.name;
    template = { ...template, layoutId, layoutVersion: lv.version };
  }
  // Template editor yang dijual photobox: versi terbaru dikunci saat simpan (#108).
  const pbTemplates: Record<string, { name: string; custom: StoredLayout }> = {};
  for (const l of layouts) {
    if (!("template" in l)) continue;
    const lv = await latest(l.template);
    if (!lv) return { ok: false, message: "Template photobox tidak ditemukan" };
    pbTemplates[l.template] = { name: lv.name, custom: lv.custom };
  }
  const extras: ExtraDesign[] = [];
  for (const x of extrasParsed.data) {
    if (!x.startsWith("tpl:")) extras.push({ preset: x as PresetId });
    else {
      const lv = await latest(x.slice(4));
      if (!lv) return { ok: false, message: "Template desain tambahan tidak ditemukan" };
      extras.push({ name: lv.name, custom: lv.custom });
    }
  }
  const branding = {
    ...(f.tagline ? { tagline: f.tagline } : {}),
    ...(f.client_name ? { clientName: f.client_name } : {}),
    ...(f.guest_color.toLowerCase() !== PAPER ? { color: f.guest_color } : {}),
    ...(logoKey ? { logoKey } : {}),
  };
  let bundle: ReturnType<typeof buildBundle>;
  try {
    bundle = buildBundle({
      id: eventId,
      name: f.name,
      eventDate: f.event_date,
      settings,
      template,
      branding,
      overlay,
      mode: f.mode,
      photobox,
      custom,
      ...(customName && { customName }),
      extras,
      pbTemplates,
      attract,
      attractImage,
      sounds,
    });
  } catch {
    return { ok: false, message: "Template tidak valid" };
  }
  const start = new Date(`${f.event_date}T00:00:00+07:00`).getTime();
  const guest = new Date(start + f.guest_days * DAY).toISOString();
  const client = new Date(start + f.client_days * DAY).toISOString();
  const { error } = await db
    .from("events")
    .update({
      name: f.name,
      event_date: f.event_date,
      location: f.location || null,
      mode: f.mode,
      lead_capture,
      settings: {
        ...settings,
        template,
        photobox,
        attract,
        guestDays: f.guest_days,
        clientDays: f.client_days,
      },
      branding,
      guest_expires_at: guest,
      client_expires_at: client,
      purge_at: guest > client ? guest : client,
      bundle,
      bundle_version: ev.bundle_version + 1,
    })
    .eq("id", eventId)
    .eq("organization_id", orgId);
  if (error) return { ok: false, message: "Gagal menyimpan, coba lagi" };

  // Penugasan device: centang = ditugaskan (hanya device organisasi ini, RLS).
  const want = form.getAll("devices").map(String);
  await db
    .from("event_devices")
    .delete()
    .eq("event_id", eventId)
    .eq("organization_id", orgId)
    .not("device_id", "in", `(${want.join(",") || "00000000-0000-0000-0000-000000000000"})`);
  if (want.length)
    await db
      .from("event_devices")
      .upsert(want.map((device_id) => ({ organization_id: orgId, event_id: eventId, device_id })));

  revalidatePath(`/admin/events/${eventId}/settings`);
  revalidatePath("/admin");
  return {
    ok: true,
    message: `Tersimpan · bundle v${ev.bundle_version + 1}. Booth menerima pengaturan baru saat online.`,
  };
}
