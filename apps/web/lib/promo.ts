import "server-only";
import { randomBytes } from "node:crypto";
import { InstagramSchema, WhatsappSchema } from "@tetra/shared";
import { z } from "zod";
import { copy } from "./copy";
import { createServiceClient } from "./supabase/service";

/**
 * Kartu promosi halaman tamu (#215). `organizations.promo` diisi admin di /admin/promo; kolom kosong = tombolnya
 * tidak tampil, semua kosong = kartu tidak tampil (B2B: vendor lain mengisi akunnya sendiri).
 */
export const PROOFS = ["instagram", "review"] as const;
export type Proof = (typeof PROOFS)[number];

const opt = <T extends z.ZodType>(s: T) =>
  z.preprocess((v) => (typeof v === "string" && !v.trim() ? undefined : v), s.optional());

export const PromoConfigSchema = z.object({
  /** Nomor admin untuk tombol "Chat admin" (62…). */
  whatsapp: opt(WhatsappSchema),
  instagram: opt(InstagramSchema),
  tiktok: opt(InstagramSchema),
  /** Link tulis ulasan Google (g.page/r/…/review). */
  reviewUrl: opt(z.url().max(300)),
  /** Pricelist / website. */
  website: opt(z.url().max(300)),
  /** Promo tamu: nomor WA wajib, lalu bukti salah satu `proofs` → kode unik. Kosong = tanpa promo. */
  offer: z
    .object({
      reward: z.string().trim().min(1).max(80),
      proofs: z.array(z.enum(PROOFS)).min(1),
    })
    .optional(),
});
export type PromoConfig = z.infer<typeof PromoConfigSchema>;

export const promoConfig = (raw: unknown): PromoConfig =>
  PromoConfigSchema.safeParse(raw ?? {}).data ?? {};

export const consentText = copy.promo.consent;

/** Data kartu untuk halaman tamu; null = event mematikan promosi / org belum mengisi apa pun. */
export type GuestPromo = PromoConfig & {
  eventId: string;
  eventName: string;
  org: string;
  clients: string[];
};

export async function loadPromo(eventId: string): Promise<GuestPromo | null> {
  const { data: ev } = await createServiceClient()
    .from("events")
    .select("id, name, client_instagram, promo_off, organizations!inner(name, promo)")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev || ev.promo_off) return null;
  const cfg = promoConfig(ev.organizations.promo);
  if (!cfg.whatsapp && !cfg.instagram && !cfg.tiktok && !cfg.reviewUrl && !cfg.website) return null;
  return {
    ...cfg,
    // Tanpa nomor admin, lead tidak bisa ditindaklanjuti: promo ikut mati.
    offer: cfg.whatsapp ? cfg.offer : undefined,
    eventId: ev.id,
    eventName: ev.name,
    org: ev.organizations.name,
    clients: ev.client_instagram,
  };
}

/** Kode promo unik, mis. "TAMU-7KQ2M" (tanpa 0/O/1/I supaya tidak salah ketik). */
export function promoCode() {
  const abc = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  return `TAMU-${[...randomBytes(5)].map((b) => abc[b % abc.length]).join("")}`;
}

/** Kartu promosi untuk halaman tamu `/s/{sessionId}`. */
export async function loadPromoForSession(sessionId: string) {
  const { data } = await createServiceClient()
    .from("sessions")
    .select("event_id")
    .eq("id", sessionId)
    .maybeSingle();
  return data ? loadPromo(data.event_id) : null;
}
