"use server";
import { LAYOUT_PRESETS, type PresetId, StoredBundle } from "@tetra/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildBundle, storeOverlay } from "@/lib/event-bundle";
import type { PhotoboxSettings } from "@/lib/payments";
import { requireMember } from "@/lib/supabase/server";

const DAY = 86_400_000;
const MAX_OVERLAY = 4 * 1024 * 1024;
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
/** Minimal nominal QRIS Xendit. */
const MIN_PRICE = 1500;

const Form = z.object({
  name: z.string().trim().min(1).max(120),
  event_date: z.iso.date(),
  location: z.string().trim().max(120),
  tagline: z.string().trim().max(40),
  client_name: z.string().trim().max(120),
  preset: z.enum(Object.keys(LAYOUT_PRESETS) as [keyof typeof LAYOUT_PRESETS]),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  countdownSec: int(1, 10),
  retakeMax: int(0, 5),
  maxPrints: int(1, 10),
  reviewTimeoutSec: int(5, 120),
  qrScreenSec: int(10, 300),
  mode: z.enum(["event", "photobox"]),
  sessionSec: int(60, 900),
  extraPrintPrice: int(0, 1_000_000),
  guest_days: int(1, 365),
  client_days: int(1, 365),
});

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
    .select("id, bundle, bundle_version")
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

  // Photobox (E3, DECISIONS #70): tiap preset yang dicentang dijual dengan harganya sendiri.
  const presets = Object.keys(LAYOUT_PRESETS) as PresetId[];
  const layouts = presets
    .filter((id) => form.get(`pb_${id}`) === "on")
    .map((id) => ({ preset: id, price: Number(form.get(`price_${id}`)) }));
  if (
    layouts.some((l) => !Number.isInteger(l.price) || l.price < MIN_PRICE || l.price > 10_000_000)
  )
    return { ok: false, message: `Harga layout minimal Rp ${MIN_PRICE.toLocaleString("id-ID")}` };
  if (f.mode === "photobox" && !layouts.length)
    return { ok: false, message: "Mode photobox: centang minimal satu layout yang dijual" };
  const photobox: PhotoboxSettings = { layouts, extraPrintPrice: f.extraPrintPrice };

  const settings = {
    sessionSec: f.sessionSec,
    countdownSec: f.countdownSec,
    retakeMax: f.retakeMax,
    maxPrints: f.maxPrints,
    reviewTimeoutSec: f.reviewTimeoutSec,
    qrScreenSec: f.qrScreenSec,
  };
  const template = { preset: f.preset, background: f.background };
  const branding = {
    ...(f.tagline ? { tagline: f.tagline } : {}),
    ...(f.client_name ? { clientName: f.client_name } : {}),
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
      settings: {
        ...settings,
        template,
        photobox,
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
