"use server";
import { DEFAULT_SETTINGS, SOUND_CUES } from "@tetra/shared";
import { z } from "zod";
import { DEFAULT_TEMPLATE } from "@/lib/event-bundle";
import { requireMember } from "@/lib/supabase/server";
import { applySettings } from "./[id]/settings/actions";

const NewEvent = z.object({
  name: z.string().trim().min(1).max(120),
  event_date: z.iso.date(),
  mode: z.enum(["event", "photobox"]),
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
      settings: { template: DEFAULT_TEMPLATE },
    })
    .select("id")
    .single();
  if (error || !ev) return { ok: false, message: "Gagal membuat event, coba lagi" };

  const full = new FormData();
  for (const [k, v] of Object.entries(DEFAULTS)) full.set(k, v);
  for (const k of new Set(form.keys())) {
    full.delete(k);
    for (const v of form.getAll(k)) full.append(k, v);
  }
  const r = await applySettings(ev.id, full);
  if (!r.ok) {
    await db.from("events").delete().eq("id", ev.id).eq("organization_id", orgId);
    return { ok: false, message: r.message };
  }
  return { ok: true, slug: r.slug ?? ev.id, ...(r.copied && { copied: r.copied }) };
}
