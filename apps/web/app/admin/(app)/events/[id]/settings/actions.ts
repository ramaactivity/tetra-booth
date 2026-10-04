"use server";
import { createHash } from "node:crypto";
import {
  EVENT_PRESETS,
  LAYOUT_PRESETS,
  type LayoutPaper,
  PHOTO_FILTERS,
  type PresetId,
  paperLabel,
  SOUND_CUES,
  type SoundCue,
  StoredBundle,
} from "@tetra/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
import { copyLayout, StoredLayout } from "@/lib/layouts";
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

const Tpl = z.string().regex(/^tpl:[0-9a-f-]{36}$/);
const Design = z.union([z.enum(EVENT_PRESETS), Tpl]);
/** "Salin & sesuaikan" juga menerima bentuk dasar di luar EVENT_PRESETS (mis. Polaroid): salinannya template. */
const CopySource = z.union([z.enum(Object.keys(LAYOUT_PRESETS) as [PresetId, ...PresetId[]]), Tpl]);
/** Desain frame event: 1–3, ukuran kertas sama; lebih dari satu = tamu memilih (DECISIONS #99). */
const MAX_DESIGNS = 3;

const Form = z.object({
  name: z.string().trim().min(1).max(120),
  event_date: z.iso.date(),
  location: z.string().trim().max(120),
  tagline: z.string().trim().max(40),
  client_name: z.string().trim().max(120),
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

/** `copied` = id template salinan "Salin & sesuaikan" (editor dibuka setelah simpan). */
export type SaveResult = { ok: boolean; message: string; copied?: string; slug?: string } | null;

/** Simpan dari halaman Pengaturan; "Salin & sesuaikan" langsung membuka editor salinannya. */
export async function saveEvent(
  eventId: string,
  slug: string,
  _prev: SaveResult,
  form: FormData,
): Promise<SaveResult> {
  const r = await applySettings(eventId, form);
  if (r.copied) redirect(`/admin/templates/${r.copied}`);
  // Nama/tanggal berubah → slug baru (trigger DB); URL lama tidak berlaku lagi.
  if (r.slug && r.slug !== slug) redirect(`/admin/events/${r.slug}/settings`);
  return r;
}

/**
 * Simpan pengaturan event (E3) + template (preset, latar, overlay) → bundle baru (bundle_version + 1) →
 * booth menarik versi baru saat online. Penugasan device diganti sesuai centang. Dipakai Pengaturan dan
 * wizard Buat event (satu jalur simpan, bundle selalu sah).
 */
export async function applySettings(
  eventId: string,
  form: FormData,
): Promise<NonNullable<SaveResult>> {
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
  // Unggahan ke R2 berjalan paralel (dulu berurutan, ±0,8 dtk per file), dimulai SETELAH semua validasi lulus.
  const uploads: (() => Promise<unknown>)[] = [];
  const file = form.get("overlay");
  if (file instanceof File && file.size > 0) {
    if (file.type !== "image/png") return { ok: false, message: "Overlay harus PNG transparan" };
    if (file.size > MAX_OVERLAY) return { ok: false, message: "Overlay maksimal 4 MB" };
    uploads.push(async () => {
      overlay = await storeOverlay(orgId, eventId, new Uint8Array(await file.arrayBuffer()));
    });
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
    uploads.push(async () => {
      const b = new Uint8Array(await bgFile.arrayBuffer());
      attractImage = await storeBundleFile(orgId, eventId, b, `attract.${ext}`, bgFile.type);
    });
  } else if (form.get("remove_attract_image") === "on") attractImage = null;
  // Suara per event (#104): mati, atau file pengganti WAV/MP3 ≤ 1 MB (file bundle snd-<cue>.<ext>).
  const sounds: Partial<Record<SoundCue, SoundSetting>> = {};
  for (const cue of SOUND_CUES) {
    const old = prev.success
      ? prev.data.files.find((x) => x.file.startsWith(`snd-${cue}.`))
      : undefined;
    const up = form.get(`snd_file_${cue}`);
    const keep = form.get(`snd_reset_${cue}`) === "on" ? undefined : old;
    // Mati tetap menyimpan file pengganti, supaya menyalakan lagi tidak perlu upload ulang.
    const setSound = (file: typeof old) => {
      if (form.get(`snd_on_${cue}`) !== "on") sounds[cue] = file ? { off: true, file } : "off";
      else if (file) sounds[cue] = file;
    };
    if (up instanceof File && up.size > 0) {
      const ext = /wav/.test(up.type) ? "wav" : /mpeg|mp3/.test(up.type) ? "mp3" : null;
      if (!ext) return { ok: false, message: `Suara "${cue}" harus WAV atau MP3` };
      if (up.size > MAX_LOGO) return { ok: false, message: `Suara "${cue}" maksimal 1 MB` };
      uploads.push(async () => {
        const b = new Uint8Array(await up.arrayBuffer());
        setSound(await storeBundleFile(orgId, eventId, b, `snd-${cue}.${ext}`, up.type));
      });
    } else setSound(keep);
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
    const key = logoKey;
    uploads.push(() => putObject(key, bytes, logo.type));
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
  // Template editor yang dijual photobox: versi terbaru dikunci saat simpan (#108).
  const pbTemplates: Record<string, { name: string; custom: StoredLayout }> = {};
  for (const l of layouts) {
    if (!("template" in l)) continue;
    const lv = await latest(l.template);
    if (!lv) return { ok: false, message: "Template photobox tidak ditemukan" };
    pbTemplates[l.template] = { name: lv.name, custom: lv.custom };
  }
  // Desain frame (utama dulu): preset, atau `tpl:<layoutId>` = template editor (versi terbaru dikunci saat simpan).
  const copy = CopySource.safeParse(form.get("copy"));
  const values = [...new Set(form.getAll("design").map(String))];
  if (copy.success && !values.includes(copy.data)) values.push(copy.data);
  const picked = z
    .array(copy.success ? z.union([Design, z.literal(copy.data)]) : Design)
    .min(1)
    .max(MAX_DESIGNS)
    .safeParse(values);
  if (!picked.success)
    return {
      ok: false,
      message: values.length
        ? `Desain frame maksimal ${MAX_DESIGNS}`
        : "Pilih minimal satu desain frame",
    };
  type Resolved = { value: string; paper: string; lv: Awaited<ReturnType<typeof latest>> };
  const resolve = async (value: string): Promise<Resolved | null> => {
    if (!value.startsWith("tpl:"))
      return { value, paper: LAYOUT_PRESETS[value as PresetId].layout.paper, lv: null };
    const lv = await latest(value.slice(4));
    return lv && { value, paper: lv.custom.layout.paper, lv };
  };
  const resolved: Resolved[] = [];
  for (const v of picked.data) {
    const r = await resolve(v);
    if (!r) return { ok: false, message: "Template desain frame tidak ditemukan" };
    resolved.push(r);
  }
  if (new Set(resolved.map((r) => r.paper)).size > 1)
    return {
      ok: false,
      message: `Ukuran desain frame harus sama: ${paperLabel(resolved[0]?.paper as LayoutPaper)}`,
    };
  // Pilihan booth divalidasi sebelum unggah & sebelum "Salin & sesuaikan" (tidak ada salinan yatim).
  const allDevices = form.get("deviceScope") !== "pick";
  if (!allDevices && !form.getAll("devices").length)
    return { ok: false, message: "Centang minimal satu booth, atau pilih Semua booth." };
  try {
    await Promise.all(uploads.map((u) => u()));
  } catch {
    return { ok: false, message: "Gagal mengunggah file, coba lagi" };
  }
  // "Salin & sesuaikan": salinan template/preset khusus event ini menggantikan sumbernya, lalu editor dibuka.
  let copied: string | null = null;
  if (copy.success) {
    copied = await copyLayout(db, orgId, copy.data, (n) => `${f.name} · ${n}`);
    const r = copied && (await resolve(`tpl:${copied}`));
    if (!r) return { ok: false, message: "Gagal menyalin desain, coba lagi" };
    resolved[values.indexOf(copy.data)] = r;
  }
  /** Salinan "Salin & sesuaikan" dibuang kalau simpan gagal setelahnya (tidak menumpuk template yatim). */
  const dropCopy = async () => {
    if (!copied) return;
    await db.from("layout_versions").delete().eq("layout_id", copied).eq("organization_id", orgId);
    await db.from("layouts").delete().eq("id", copied).eq("organization_id", orgId);
  };
  const [main, ...rest] = resolved as [Resolved, ...Resolved[]];
  const custom = main.lv?.custom ?? null;
  const customName = main.lv?.name;
  const template: EventTemplate = {
    preset: main.lv ? "strip-3" : (main.value as PresetId),
    background: f.background,
    ...(main.lv && { layoutId: main.value.slice(4), layoutVersion: main.lv.version }),
    ...(rest.length && { extras: rest.map((r) => r.value) }),
    versions: Object.fromEntries(
      resolved.flatMap((r) => (r.lv ? [[r.value.slice(4), r.lv.version]] : [])),
    ),
  };
  const extras: ExtraDesign[] = rest.map((r) =>
    r.lv ? { name: r.lv.name, custom: r.lv.custom } : { preset: r.value as PresetId },
  );
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
    await dropCopy();
    return { ok: false, message: "Template tidak valid" };
  }
  const start = new Date(`${f.event_date}T00:00:00+07:00`).getTime();
  const guest = new Date(start + f.guest_days * DAY).toISOString();
  const client = new Date(start + f.client_days * DAY).toISOString();
  const { data: saved, error } = await db
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
      all_devices: allDevices,
    })
    .eq("id", eventId)
    .eq("organization_id", orgId)
    .select("slug")
    .single();
  if (error || !saved) {
    await dropCopy();
    return { ok: false, message: "Gagal menyimpan, coba lagi" };
  }

  // Penugasan device: centang = ditugaskan (hanya device organisasi ini, RLS). Dipakai saat "Pilih booth";
  // disimpan juga saat "Semua booth" supaya pilihan lama kembali kalau diganti lagi.
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

  revalidatePath("/admin/(app)/events/[id]", "layout");
  revalidatePath("/admin");
  return {
    ok: true,
    message: `Tersimpan · bundle v${ev.bundle_version + 1}. Booth menerima pengaturan baru saat online.`,
    slug: saved.slug,
    ...(copied && { copied }),
  };
}
