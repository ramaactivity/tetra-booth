import type { Database } from "@tetra/db";
import type { CloudSettings, CloudSettingsPatch } from "@tetra/shared";
import { guestPath } from "./guest-link";

/** Warna header bawaan halaman tamu: tidak disimpan di branding (sama dengan Simpan Pengaturan admin). */
export const PAPER = "#f8f7f4";

type Json = Record<string, unknown>;
type EventUpdate = Database["public"]["Tables"]["events"]["Update"];
/** Kolom events yang dibaca/diubah Backstage tahap 2 (#295). */
export type CloudRow = {
  slug: string;
  client_token: string | null;
  live_token: string | null;
  guest_token: string | null;
  guest_link: string | null;
  settings: Json | null;
  lead_capture: Json | null;
  promo_off: boolean;
  branding: Json | null;
  client_instagram: string[] | null;
  bundle: Json | null;
  bundle_version: number;
};

const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");

export function cloudSettingsOf(ev: CloudRow): CloudSettings {
  const lead = obj(ev.lead_capture);
  const branding = obj(ev.branding);
  const link = ev.guest_token ? guestPath(ev) : null;
  return {
    slug: ev.slug,
    clientLink: !!ev.client_token,
    liveLink: !!ev.live_token,
    guestCam: !!link && obj(obj(ev.settings).guestCam).enabled === true,
    guestPath: link,
    leadCapture: lead.enabled === true,
    leadReady: Array.isArray(lead.fields) && lead.fields.length > 0 && !!str(lead.consentText),
    promoCard: !ev.promo_off,
    tagline: str(branding.tagline),
    clientName: str(branding.clientName),
    clientInstagram: ev.client_instagram ?? [],
    guestColor: str(branding.color) || null,
  };
}

/** Teks kosong = kunci dihapus. */
const setText = (o: Json, key: string, v: string | null | undefined) => {
  if (v === undefined) return o;
  const { [key]: _, ...rest } = o;
  return v ? { ...rest, [key]: v } : rest;
};

/**
 * Patch crew → kolom events yang diubah. `token()` = token akses baru, `guestLink` = alamat Snapbook rapi bila link
 * Guest Cam baru dibuat. Yang ikut ke booth (link live, Guest Cam, tagline) menaikkan `bundle_version` supaya semua
 * booth event ini mengunduh ulang. Lead capture hanya bisa dinyalakan kalau field + persetujuan sudah diatur admin.
 */
export function cloudSettingsUpdate(
  ev: CloudRow,
  patch: CloudSettingsPatch,
  gen: { token: () => string; guestLink: string | null },
): { update: EventUpdate; error?: "lead_not_ready" } {
  const u: Json = {};
  let bump = false;
  const bundle = obj(ev.bundle);
  let config = obj(bundle.config);
  let settings = obj(ev.settings);

  if (patch.clientLink !== undefined)
    u.client_token = patch.clientLink ? (ev.client_token ?? gen.token()) : null;
  if (patch.liveLink !== undefined) {
    u.live_token = patch.liveLink ? (ev.live_token ?? gen.token()) : null;
    bump = true;
  }
  if (patch.guestCam !== undefined) {
    const on = patch.guestCam;
    settings = { ...settings, guestCam: { ...obj(settings.guestCam), enabled: on } };
    const cs = obj(config.settings);
    config = { ...config, settings: { ...cs, guestCam: { ...obj(cs.guestCam), enabled: on } } };
    if (on && !ev.guest_token) {
      u.guest_token = gen.token();
      u.guest_link = gen.guestLink;
    }
    u.settings = settings;
    bump = true;
  }
  if (patch.leadCapture !== undefined) {
    if (patch.leadCapture && !cloudSettingsOf(ev).leadReady)
      return { update: {}, error: "lead_not_ready" };
    u.lead_capture = { ...obj(ev.lead_capture), enabled: patch.leadCapture };
  }
  if (patch.promoCard !== undefined) u.promo_off = !patch.promoCard;
  if (patch.clientInstagram !== undefined) u.client_instagram = patch.clientInstagram;

  let branding = obj(ev.branding);
  branding = setText(branding, "tagline", patch.tagline);
  branding = setText(branding, "clientName", patch.clientName);
  if (patch.guestColor !== undefined)
    branding = setText(
      branding,
      "color",
      patch.guestColor && patch.guestColor.toLowerCase() !== PAPER ? patch.guestColor : "",
    );
  if (patch.tagline !== undefined) {
    // Tagline juga tampil di layar awal booth (bundle `tagline`).
    config = setText(config, "tagline", patch.tagline);
    bump = true;
  }
  if (
    patch.tagline !== undefined ||
    patch.clientName !== undefined ||
    patch.guestColor !== undefined
  )
    u.branding = branding;

  if (bump) {
    // Event tanpa bundle tersimpan (belum pernah Simpan Pengaturan) tidak diberi bundle setengah jadi.
    if (bundle.config) u.bundle = { ...bundle, config };
    u.bundle_version = ev.bundle_version + 1;
  }
  // Isi JSON berasal dari kolom yang sama (sudah JSON); tipe Json Supabase lebih sempit dari Record<string, unknown>.
  return { update: u as EventUpdate };
}
