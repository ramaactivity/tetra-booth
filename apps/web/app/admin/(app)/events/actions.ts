"use server";
import { DEFAULT_SETTINGS, LAYOUT_PRESETS, SOUND_CUES } from "@tetra/shared";
import { z } from "zod";
import { DEFAULT_TEMPLATE } from "@/lib/event-bundle";
import { CARD_IDS } from "@/lib/guest-card-art";
import { copyLayout } from "@/lib/layouts";
import { requireMember } from "@/lib/supabase/server";
import { layoutFromUpload } from "@/lib/template-upload";
import {
  OPS_MAX_DAYS,
  type OpsBooking,
  type OpsPackage,
  opsBookingNow,
  opsBookings,
  opsGuestCam,
  opsPackages,
} from "@/lib/tetra-ops";
import { applySettings } from "./[id]/settings/actions";

const NewEvent = z.object({
  name: z.string().trim().min(1).max(120),
  event_date: z.iso.date(),
  mode: z.enum(["event", "photobox"]),
  /** project_id booking Tetra Ops asal event (impor wizard), hanya referensi. */
  ops_project_id: z
    .string()
    .regex(/^[\w-]{1,64}$/)
    .nullish(),
  /** Ukuran frame booking Ops (#162), untuk peringatan kertas di Pengaturan. */
  ops_frame_size: z.enum(["2R", "4R", "polaroid"]).nullish(),
  /**
   * Desain frame mode Event (#162): `auto` = template baru dari tata letak `auto_preset`, `upload` = template dari
   * desain PNG (#161); keduanya bernama event & jadi desain utama. Kosong = pilih desain yang ada (`design`).
   */
  design_mode: z.enum(["auto", "upload"]).nullish(),
  auto_preset: z.enum(Object.keys(LAYOUT_PRESETS) as [keyof typeof LAYOUT_PRESETS]).nullish(),
});

/** Isian Pengaturan yang tidak ditanyakan wizard: nilai bawaan yang sama dengan halaman Pengaturan. */
const DEFAULTS: Record<string, string> = {
  location: "",
  tagline: "",
  client_name: "",
  background: DEFAULT_TEMPLATE.background,
  guest_color: "#f8f7f4",
  attract_bg: "#f8f7f4",
  attract_cta: "",
  attract_brand: "",
  attract_samples: "on",
  countdownSec: String(DEFAULT_SETTINGS.countdownSec),
  retakeMax: String(DEFAULT_SETTINGS.retakeMax),
  maxPrints: String(DEFAULT_SETTINGS.maxPrints),
  reviewTimeoutSec: String(DEFAULT_SETTINGS.reviewTimeoutSec),
  qrScreenSec: String(DEFAULT_SETTINGS.qrScreenSec),
  sessionSec: String(DEFAULT_SETTINGS.sessionSec),
  extraPrintPrice: "10000",
  lead_mode: "optional",
  // Lead mati; field bawaan sama dengan Pengaturan (nama + WhatsApp) supaya tinggal dinyalakan.
  lead_f_name: "on",
  lead_f_whatsapp: "on",
  consent_text: "",
  guest_days: "30",
  client_days: "90",
  deviceScope: "all",
  ...(DEFAULT_SETTINGS.bumper && { bumper: "on" }),
  // Semua momen suara nyala (seperti event tanpa pengaturan suara); saklar utama tetap mati.
  ...Object.fromEntries(SOUND_CUES.map((c) => [`snd_on_${c}`, "on"])),
};

export type CreateResult =
  | { ok: false; message: string }
  | { ok: true; slug: string; copied?: string }
  | null;

/**
 * Wizard Buat event: buat baris event, lalu simpan lewat jalur yang sama dengan Pengaturan (`applySettings`
 * → bundle v2 sah). Simpan gagal = event dihapus lagi, jadi tidak ada event setengah jadi.
 */
export async function createEventWizard(
  _prev: CreateResult,
  form: FormData,
): Promise<CreateResult> {
  const { db, orgId, user } = await requireMember(["owner", "admin"]);
  const p = NewEvent.safeParse({
    name: form.get("name"),
    event_date: form.get("event_date"),
    mode: form.get("mode"),
    ops_project_id: form.get("ops_project_id") || null,
    ops_frame_size: form.get("ops_frame_size") || null,
    design_mode: form.get("design_mode") || null,
    auto_preset: form.get("auto_preset") || null,
  });
  if (!p.success) return { ok: false, message: "Isi nama, tanggal, dan mode event" };
  const { data: ev, error } = await db
    .from("events")
    .insert({
      organization_id: orgId,
      name: p.data.name,
      event_date: p.data.event_date,
      mode: p.data.mode,
      status: "ready",
      created_by: user.id,
      ops_project_id: p.data.ops_project_id ?? null,
      ops_frame_size: p.data.ops_frame_size ?? null,
      settings: { template: DEFAULT_TEMPLATE },
    })
    .select("id")
    .single();
  if (error || !ev) return { ok: false, message: "Gagal membuat event, coba lagi" };

  const dropEvent = () => db.from("events").delete().eq("id", ev.id).eq("organization_id", orgId);

  // Template baru khusus event (#162): dibuat dulu, lalu dipasang lewat `design` seperti template biasa.
  let made: string | null = null;
  const { design_mode: dm, auto_preset } = p.data;
  if (dm === "upload") {
    const u = await layoutFromUpload(db, orgId, form, p.data.name, p.data.mode);
    if ("error" in u) {
      await dropEvent();
      return { ok: false, message: u.error };
    }
    made = u.id;
  } else if (dm === "auto" && auto_preset)
    made = await copyLayout(db, orgId, auto_preset, () => p.data.name, p.data.mode);
  if (dm && !made) {
    await dropEvent();
    return { ok: false, message: "Gagal membuat template desain, coba lagi" };
  }

  const full = new FormData();
  for (const [k, v] of Object.entries(DEFAULTS)) full.set(k, v);
  for (const k of new Set(form.keys())) {
    full.delete(k);
    for (const v of form.getAll(k)) full.append(k, v);
  }
  for (const k of ["ov", "slots", "paper", "orient", "design_mode", "auto_preset"]) full.delete(k);
  if (made) full.set("design", `tpl:${made}`);
  const r = await applySettings(ev.id, full);
  if (!r.ok) {
    await dropEvent();
    if (made) {
      await db.from("layout_versions").delete().eq("layout_id", made).eq("organization_id", orgId);
      await db.from("layouts").delete().eq("id", made).eq("organization_id", orgId);
    }
    return { ok: false, message: r.message };
  } // Paket Guest Cam dari booking Ops (#226, kontrak v0.9): batas tamu, add-on cetak, desain kartu QR.
  if (p.data.ops_project_id) {
    const now = await opsBookingNow({
      event_date: p.data.event_date,
      ops_project_id: p.data.ops_project_id,
    });
    const gc = now?.booking ? opsGuestCam(now.booking, CARD_IDS) : {};
    if (Object.keys(gc).length) {
      const { data: cur } = await db
        .from("events")
        .select("settings")
        .eq("id", ev.id)
        .eq("organization_id", orgId)
        .single();
      const settings = (cur?.settings ?? {}) as { guestCam?: Record<string, unknown> };
      await db
        .from("events")
        .update({ settings: { ...settings, guestCam: { ...settings.guestCam, ...gc } } })
        .eq("id", ev.id)
        .eq("organization_id", orgId);
    }
  }

  const copied = made ?? r.copied;
  return { ok: true, slug: r.slug ?? ev.id, ...(copied && { copied }) };
}

export type OpsList =
  | { ok: true; bookings: OpsBooking[]; packages: OpsPackage[] }
  | { ok: false; message: string };

/**
 * Wizard "Ambil dari Tetra Ops": booking hari ini s.d. +179 hari (batas Tetra Ops 180 hari) + paket aktif
 * (baca-saja). Wizard memilahnya per bulan di klien. Owner/admin.
 */
export async function loadOps(): Promise<OpsList> {
  await requireMember(["owner", "admin"]);
  const ymd = (ms: number) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(ms));
  const now = Date.now();
  try {
    const [bookings, packages] = await Promise.all([
      opsBookings(ymd(now), ymd(now + (OPS_MAX_DAYS - 1) * 86_400_000)),
      opsPackages(),
    ]);
    return { ok: true, bookings, packages };
  } catch (e) {
    console.warn(`[tetra-ops] ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, message: "Tetra Ops tidak bisa dihubungi. Isi manual, atau coba lagi." };
  }
}
