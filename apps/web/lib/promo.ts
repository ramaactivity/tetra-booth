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

/** Bentuk diskon kode promo tamu (#218), diterapkan Ops di invoice booking. */
export const DiscountSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("percent"),
    value: z.number().int().min(1).max(100),
    /** Batas potongan (Rp); kosong = tanpa batas. */
    maxIdr: z.number().int().min(1000).max(100_000_000).optional(),
  }),
  z.object({ type: z.literal("amount"), value: z.number().int().min(1000).max(100_000_000) }),
  /** Bonus layanan, mis. "Gratis Guest Cam"; Ops menambahkannya sebagai item Rp0. */
  z.object({ type: z.literal("item"), item: z.string().trim().min(1).max(60) }),
]);
export type Discount = z.infer<typeof DiscountSchema>;

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
      discount: DiscountSchema,
      /** Minimal nilai booking (Rp) agar kode berlaku; kosong = tanpa minimal. */
      minIdr: z.number().int().min(0).max(100_000_000).optional(),
      /** Masa berlaku kode sejak diklaim (#218). */
      validDays: z.number().int().min(7).max(365).default(90),
      proofs: z.array(z.enum(PROOFS)).min(1),
    })
    .optional(),
});
export type PromoConfig = z.infer<typeof PromoConfigSchema>;
export type Offer = NonNullable<PromoConfig["offer"]>;

const rp = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
/** Teks hadiah untuk tamu, selalu dari nilai diskon (tidak bisa beda dengan yang diterapkan Ops). */
export const rewardLabel = (d: Discount) =>
  d.type === "percent"
    ? `Diskon ${d.value}% booking`
    : d.type === "amount"
      ? `Potongan ${rp(d.value)} booking`
      : d.item;

/** Nilai promo yang dibekukan di lead saat kode terbit (#218): perubahan pengaturan tidak mengubah kode lama. */
export type PromoSnapshot = { label: string; discount: Discount; minIdr: number | null };
export const snapshotOf = (o: Offer): PromoSnapshot => ({
  label: rewardLabel(o.discount),
  discount: o.discount,
  minIdr: o.minIdr ?? null,
});

export const promoConfig = (raw: unknown): PromoConfig =>
  PromoConfigSchema.safeParse(raw ?? {}).data ?? {};

export const consentText = copy.promo.consent;

/** Data kartu untuk halaman tamu; null = event mematikan promosi / org belum mengisi apa pun. */
export type GuestPromo = Omit<PromoConfig, "offer"> & {
  offer: { reward: string; proofs: Proof[] } | undefined;
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
    offer:
      cfg.whatsapp && cfg.offer
        ? { reward: rewardLabel(cfg.offer.discount), proofs: cfg.offer.proofs }
        : undefined,
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

/** Status kode promo (#218); urutan alasan: ditolak admin → sudah dipakai → kedaluwarsa. */
export type CodeState = "valid" | "rejected" | "redeemed" | "expired";
export function codeState(
  l: {
    promo_expires_at: string | null;
    promo_rejected_at: string | null;
    redeemed_at: string | null;
  },
  now = Date.now(),
): CodeState {
  if (l.promo_rejected_at) return "rejected";
  if (l.redeemed_at) return "redeemed";
  if (l.promo_expires_at && new Date(l.promo_expires_at).getTime() <= now) return "expired";
  return "valid";
}

/** Link booking Tetra Ops dengan kode terisi (Hermes mengirimnya ke tamu). */
export const bookingUrl = (code: string) =>
  `https://booking.tetraphoto.com/?promo=${encodeURIComponent(code)}`;

/** Format kode promo tamu (alfabet `promoCode`). */
export const CODE = /^TAMU-[2-9A-HJ-NP-Z]{5}$/;
export const PROMO_LEAD =
  "id, data, promo_code, promo, promo_expires_at, promo_rejected_at, redeemed_at, redeemed_project_id";
