import "server-only";
import { randomBytes } from "node:crypto";
import { EventSettingsSchema, type GuestMe, LayoutSpecSchema, StoredBundle } from "@tetra/shared";
import { cookies } from "next/headers";
import { sha256 } from "@/lib/booth";
import type { EventBranding } from "@/lib/event-bundle";
import { guestPhotosVisible } from "@/lib/events";
import { byLinkGuest, LINK } from "@/lib/gallery";
import { presignGet } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Guest Cam (#197): event dari link QR `/c/{slug atau guest_token}`. Aktif = `guest_token` terisi + setelan
 * guestCam.enabled + belum purge/kedaluwarsa. Browser tamu diikat ke sesinya lewat cookie berisi kunci acak;
 * server hanya menyimpan hash-nya (`sessions.guest_key_hash`).
 */
export async function guestEvent(token: string) {
  if (!LINK.test(token)) return null;
  const { data } = await createServiceClient()
    .from("events")
    .select(
      "id, organization_id, slug, name, event_date, branding, settings, bundle, run, guest_revealed_at, guest_expires_at, purged_at",
    )
    .or(byLinkGuest(token))
    .not("guest_token", "is", null)
    .limit(1)
    .maybeSingle();
  if (!data || data.purged_at) return null;
  if (data.guest_expires_at && new Date(data.guest_expires_at) <= new Date()) return null;
  const cam = EventSettingsSchema.parse(data.settings ?? {}).guestCam;
  if (!cam.enabled) return null;
  return { ...data, cam };
}
export type GuestEvent = NonNullable<Awaited<ReturnType<typeof guestEvent>>>;

/** Foto boleh dilihat: reveal live, dibuka owner, atau acara sudah selesai (Hentikan Acara / tanggal lewat). */
export const guestRevealed = (ev: GuestEvent, now = Date.now()) => guestPhotosVisible(ev, now);

/** Header halaman tamu: warna + logo (URL bertanda tangan), sama dengan halaman tamu booth. */
export async function guestBranding(ev: GuestEvent) {
  const b = (ev.branding ?? {}) as EventBranding;
  return {
    ...(b.tagline && { tagline: b.tagline }),
    ...(b.color && { color: b.color }),
    ...(b.logoKey && { logoUrl: await presignGet(b.logoKey) }),
  };
}

/**
 * Desain utama event untuk strip virtual (#197): layout + URL bertanda tangan aset & font dari bundle, dirender di HP
 * lewat template engine yang sama dengan booth (aturan 2). Font pustaka `lib-*` dari /fonts (same origin).
 */
async function guestDesign(ev: GuestEvent) {
  const b = StoredBundle.safeParse(ev.bundle);
  const layout = LayoutSpecSchema.safeParse(b.success ? b.data.config.layout : null);
  if (!b.success || !layout.success) return null;
  const names = (b.data.config.assets ?? {}) as Record<string, string>;
  const url = async (id: string) => {
    const key = b.data.files.find((f) => f.file === names[id])?.key;
    return key ? presignGet(key, 6 * 3600) : null;
  };
  const assets: Record<string, string> = {};
  for (const id of [layout.data.overlay?.assetId, layout.data.background?.assetId]) {
    const u = id ? await url(id) : null;
    if (id && u) assets[id] = u;
  }
  const fonts: Record<string, string> = {};
  for (const { fontAssetId: id } of layout.data.texts) {
    const u = id.startsWith("lib-") ? `/fonts/${id.slice(4)}.woff2` : await url(id);
    if (u) fonts[id] = u;
  }
  return { layout: layout.data, assets, fonts };
}

/** Info publik untuk halaman Guest Cam (GET /api/c/{token} dan render awal /c/{token}). */
export async function guestInfo(ev: GuestEvent) {
  const picked = (EventSettingsSchema.parse(ev.settings ?? {}).filters ?? []).filter(
    (f) => f !== "normal",
  );
  return {
    name: ev.name,
    date: ev.event_date,
    branding: await guestBranding(ev),
    filters: ["normal", ...picked],
    shots: ev.cam.shots,
    reveal: ev.cam.reveal,
    approval: ev.cam.approval,
    voice: ev.cam.voice,
    strip: ev.cam.strip,
    consentText: ev.cam.consentText,
    revealed: guestRevealed(ev),
    design: ev.cam.strip ? await guestDesign(ev) : null,
    /** Isi elemen QR di desain strip: halaman Guest Cam acara ini. */
    link: `/c/${ev.slug}`,
  };
}
export type GuestInfo = Awaited<ReturnType<typeof guestInfo>>;

const cookieName = (ev: { id: string }) => `tgc_${ev.id.slice(0, 8)}`;

export async function newGuestKey(ev: { id: string }) {
  const key = randomBytes(24).toString("base64url");
  (await cookies()).set(cookieName(ev), key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 180 * 86_400,
  });
  return sha256(key);
}

/** Sesi tamu milik browser ini, atau null. */
export async function guestSession(ev: GuestEvent) {
  const key = (await cookies()).get(cookieName(ev))?.value;
  if (!key) return null;
  const { data } = await createServiceClient()
    .from("sessions")
    .select("id, group_name")
    .eq("organization_id", ev.organization_id)
    .eq("event_id", ev.id)
    .eq("source", "guest")
    .eq("guest_key_hash", sha256(key))
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

export const guestKey = (
  ev: GuestEvent,
  sessionId: string,
  kind: string,
  idx: number,
  ext: string,
) => `${ev.organization_id}/${ev.id}/sessions/${sessionId}/${kind}_${idx}.${ext}`;

/** Isi milik tamu: sisa jatah, idx terpakai, dan URL foto/strip kalau sudah boleh dilihat. */
export async function guestMe(
  ev: GuestEvent,
  s: { id: string; group_name: string | null },
): Promise<GuestMe> {
  const { data: rows } = await createServiceClient()
    .from("assets")
    .select("kind, idx, r2_key, review_status, hidden_at")
    .eq("organization_id", ev.organization_id)
    .eq("session_id", s.id);
  const assets = rows ?? [];
  const used = assets.filter((a) => a.kind === "original").map((a) => a.idx);
  const revealed = guestRevealed(ev);
  const visible = (kind: string) =>
    assets.filter((a) => a.kind === kind && a.review_status !== "rejected" && !a.hidden_at);
  const items = async (main: string, thumb: string) =>
    revealed
      ? Promise.all(
          visible(main).map(async (a) => {
            const t = assets.find((x) => x.kind === thumb && x.idx === a.idx);
            return {
              idx: a.idx,
              waiting: a.review_status === "pending",
              url: await presignGet(a.r2_key, 6 * 3600),
              thumbUrl: t ? await presignGet(t.r2_key, 6 * 3600) : undefined,
            };
          }),
        )
      : [];
  return {
    sessionId: s.id,
    name: s.group_name ?? "",
    shotsLeft: Math.max(0, ev.cam.shots - used.length),
    usedIdx: used.sort((a, b) => a - b),
    photos: await items("original", "thumb_original"),
    strips: await items("strip_web", "thumb_strip"),
    stripCount: assets.filter((a) => a.kind === "strip_web").length,
    audio: assets.some((a) => a.kind === "audio"),
    revealed,
  };
}
