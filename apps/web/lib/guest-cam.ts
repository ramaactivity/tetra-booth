import "server-only";
import { randomBytes } from "node:crypto";
import {
  EventDesignSchema,
  EventSettingsSchema,
  type GuestMe,
  type GuestPrintStatus,
  guestHardCap,
  LAYOUT_PRESETS,
  type LayoutSpec,
  parseRun,
  runState,
  StoredBundle,
} from "@tetra/shared";
import { cookies } from "next/headers";
import { sha256 } from "@/lib/booth";
import type { EventBranding } from "@/lib/event-bundle";
import { eventPhase, guestPhotosVisible, ymdWib } from "@/lib/events";
import { LINK } from "@/lib/gallery";
import { presignGet } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Guest Cam (#197): event dari link QR `/c/{guest_token}` (token acak, #203). Aktif = `guest_token` terisi + setelan
 * guestCam.enabled + belum purge/kedaluwarsa. Browser tamu diikat ke sesinya lewat cookie berisi kunci acak;
 * server hanya menyimpan hash-nya (`sessions.guest_key_hash`).
 */
export async function guestEvent(token: string) {
  if (!LINK.test(token)) return null;
  const { data } = await createServiceClient()
    .from("events")
    .select(
      "id, organization_id, slug, name, event_date, branding, settings, bundle, run, guest_revealed_at, guest_expires_at, purged_at, public_gallery, live_token, guest_token",
    )
    // Token acak, bukan slug: "Cabut & buat ulang" harus mematikan QR yang sudah dicetak (#203).
    .eq("guest_token", token)
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

/**
 * Kamera tamu ditutup setelah acara (desain A10 "Acara selesai"): Hentikan Acara atau tanggal lewat. Daftar baru
 * ditolak; unggahan yang masih antre di HP tetap diterima. "Segera dibuka" (sebelum tanggal) sengaja tidak ada,
 * supaya owner/crew bisa mencoba H-1 (DECISIONS #203).
 */
export const guestClosed = (ev: GuestEvent, now = Date.now()) => {
  const run = runState(parseRun(ev.run));
  return run === "finished" || eventPhase(ev.event_date, run, ymdWib(now)) === "selesai";
};

/** Foto sampul pembuka (A1): original booth/Photo Stage pertama event ini, atau null (belum ada foto). */
async function guestCover(ev: GuestEvent) {
  const { data } = await createServiceClient()
    .from("assets")
    .select("r2_key, sessions!inner(event_id, source, is_test, hidden_at, deleted_at)")
    .eq("organization_id", ev.organization_id)
    .eq("kind", "original")
    .is("hidden_at", null)
    .eq("sessions.event_id", ev.id)
    .in("sessions.source", ["booth", "stage"])
    .eq("sessions.is_test", false)
    .is("sessions.hidden_at", null)
    .is("sessions.deleted_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data ? presignGet(data.r2_key.split("#")[0] ?? data.r2_key, 6 * 3600) : null;
}

/** Header halaman tamu: warna + logo (URL bertanda tangan), sama dengan halaman tamu booth. */
export async function guestBranding(ev: GuestEvent) {
  const b = (ev.branding ?? {}) as EventBranding;
  return {
    ...(b.tagline && { tagline: b.tagline }),
    ...(b.color && { color: b.color }),
    ...(b.logoKey && { logoUrl: await presignGet(b.logoKey) }),
  };
}

/** Frame bawaan Tetra untuk Photo frame tamu (#212): 2R strip (default), 4R, polaroid. Latar putih, teks nama + tanggal. */
const TETRA_FRAMES = [
  ["strip-3", "Strip 2R"],
  ["4r-grid", "4R"],
  ["polaroid-1", "Polaroid"],
] as const;

/**
 * Desain Photo frame tamu (#197/#212): desain booth event dulu (bundle `designs`, atau layout utama, + layout photobox)
 * supaya paket bundling memakai frame yang sama dengan booth, lalu frame bawaan Tetra 2R/4R/Polaroid. Layout + URL
 * bertanda tangan aset & font dirender di HP lewat template engine yang sama dengan booth (aturan 2). Font pustaka
 * `lib-*` dari /fonts (same origin).
 */
async function guestDesigns(ev: GuestEvent) {
  const b = StoredBundle.safeParse(ev.bundle);
  const cfg = (b.success ? b.data.config : {}) as {
    layout?: unknown;
    designs?: unknown[];
    photobox?: { layouts?: unknown[] };
    assets?: Record<string, string>;
  };
  const booth = [
    ...(cfg.designs ?? [{ id: "main", name: "Desain booth", info: "", layout: cfg.layout }]),
    ...(cfg.photobox?.layouts ?? []),
  ].flatMap((d) => {
    const r = EventDesignSchema.safeParse(d);
    return r.success ? [r.data] : [];
  });
  const names = cfg.assets ?? {};
  const url = async (id: string) => {
    const key = b.success ? b.data.files.find((f) => f.file === names[id])?.key : undefined;
    return key ? presignGet(key, 6 * 3600) : null;
  };
  const out = [];
  for (const d of booth.slice(0, 6)) {
    const assets: Record<string, string> = {};
    for (const id of [d.layout.overlay?.assetId, d.layout.background?.assetId]) {
      const u = id ? await url(id) : null;
      if (id && u) assets[id] = u;
    }
    const fonts: Record<string, string> = {};
    for (const { fontAssetId: id } of d.layout.texts) {
      const u = id.startsWith("lib-") ? `/fonts/${id.slice(4)}.woff2` : await url(id);
      if (u) fonts[id] = u;
    }
    out.push({ id: `b-${d.id}`, name: d.name, booth: true, layout: d.layout, assets, fonts });
  }
  for (const [id, name] of TETRA_FRAMES)
    out.push({
      id,
      name,
      booth: false,
      layout: {
        ...LAYOUT_PRESETS[id].layout,
        id,
        version: 1,
        background: { color: "#ffffff" },
      } as LayoutSpec,
      assets: {},
      fonts: {},
    });
  return out;
}

/**
 * Frame yang boleh dicetak (#223): desain booth event (kertas yang terpasang di printer booth). Event tanpa desain
 * booth (Guest Cam + Print Station saja) boleh mencetak frame bawaan Tetra.
 */
const printable = <D extends { booth: boolean }>(ds: D[]) => {
  const anyBooth = ds.some((d) => d.booth);
  return ds.map((d) => ({ ...d, printable: d.booth || !anyBooth }));
};

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
    designs: ev.cam.strip ? printable(await guestDesigns(ev)) : [],
    /** Add-on cetak di lokasi (#223). */
    print: ev.cam.print && ev.cam.strip,
    coverUrl: await guestCover(ev),
    closed: guestClosed(ev),
    publicGallery: ev.public_gallery,
    /** Galeri publik dari luar sesi tamu (A10 "Acara selesai"): `/l/{slug}`, perlu link live aktif. */
    eventGallery: ev.public_gallery && ev.live_token ? `/l/${ev.slug}` : null,
    galleryUntil: ev.guest_expires_at,
    /** Isi elemen QR di desain strip: halaman Guest Cam acara ini. */
    link: `/c/${ev.guest_token}`,
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
    .select("id, group_name, asset_count")
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

/** Identitas tamu untuk kuota (#221): nomor WA, lalu IG; tanpa keduanya = sesi itu sendiri. */
export const guestIdentity = (
  d: { whatsapp?: string | undefined; instagram?: string | undefined } | null,
  sessionId: string,
) => d?.whatsapp ?? (d?.instagram ? `ig:${d.instagram}` : sessionId);

/**
 * Kuota tamu per tier (#221). Tamu = sesi Guest Cam yang sudah mengirim ≥ 1 foto; satu nomor WA/IG = satu tamu
 * walau dari beberapa HP. Tamu yang sudah terhitung selalu boleh lanjut; tamu baru ditolak hanya kalau
 * pemakaian sudah mencapai batas + 10%. Tanpa batas (`maxGuests` null) = selalu boleh.
 */
export async function guestQuota(ev: GuestEvent) {
  const max = ev.cam.maxGuests;
  if (!max) return { used: null, max: null, admits: () => true };
  const { data } = await createServiceClient()
    .from("sessions")
    .select("id, leads(data)")
    .eq("organization_id", ev.organization_id)
    .eq("event_id", ev.id)
    .eq("source", "guest")
    .gt("asset_count", 0)
    .is("deleted_at", null);
  const counted = new Set(
    (data ?? []).map((s) =>
      guestIdentity(s.leads[0]?.data as { whatsapp?: string; instagram?: string } | null, s.id),
    ),
  );
  return {
    used: counted.size,
    max,
    admits: (identity: string) => counted.has(identity) || counted.size < guestHardCap(max),
  };
}

/** Identitas sesi tamu dari lead-nya (dipakai saat foto pertama). */
export async function sessionIdentity(ev: GuestEvent, sessionId: string) {
  const { data } = await createServiceClient()
    .from("leads")
    .select("data")
    .eq("organization_id", ev.organization_id)
    .eq("session_id", sessionId)
    .limit(1)
    .maybeSingle();
  return guestIdentity(data?.data as { whatsapp?: string; instagram?: string } | null, sessionId);
}

export const quotaFull = () => Response.json({ error: "guest_full" }, { status: 403 });

/** Satu desain frame tamu (dengan tanda boleh dicetak) menurut id. */
export async function guestDesignById(ev: GuestEvent, id: string) {
  return printable(await guestDesigns(ev)).find((d) => d.id === id) ?? null;
}

/** Cetak tamu ini (#223), atau null kalau belum pernah. */
export async function guestPrint(ev: GuestEvent, sessionId: string) {
  const { data } = await createServiceClient()
    .from("guest_prints")
    .select("number, status")
    .eq("organization_id", ev.organization_id)
    .eq("session_id", sessionId)
    .maybeSingle();
  return data ? { number: data.number, status: data.status as GuestPrintStatus } : null;
}
