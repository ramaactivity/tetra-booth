import "server-only";
import { EventSettingsSchema } from "@tetra/shared";
import { guestPhotosVisible } from "@/lib/events";
import { byLink, LINK } from "@/lib/gallery";
import { presignGet } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase/service";

/** Live slideshow `/live/{slug atau token}` (FSD §4, desain D1): strip terbaru event yang tidak disembunyikan. */
/** `by` = nama tamu Guest Cam (#197), tampil "oleh Sari" di TV. */
export type LiveStrip = { id: string; url: string; at: string; by?: string };
/** `publicGallery`: QR ke galeri publik `/l/{token}` tampil di slideshow (DECISIONS #75). */
export type LiveEvent = {
  name: string;
  tagline: string | null;
  date: string;
  publicGallery: boolean;
  /** Guest Cam (#197/#203): link /c untuk kartu ajakan TV + hitungan; null = Guest Cam mati. */
  guest: { path: string; photos: number; guests: number } | null;
};

export async function loadLive(token: string, limit = 24) {
  if (!LINK.test(token)) return null;
  const db = createServiceClient();
  const { data: ev } = await db
    .from("events")
    .select(
      "id, organization_id, name, event_date, branding, purged_at, public_gallery, settings, run, guest_revealed_at, guest_token",
    )
    .or(byLink("live_token", token))
    .not("live_token", "is", null)
    .limit(1)
    .maybeSingle();
  if (!ev || ev.purged_at) return null;
  const { data: rows } = await db
    .from("sessions")
    .select("id, started_at, source, group_name, assets!inner(kind, idx, r2_key)")
    .eq("event_id", ev.id)
    .eq("organization_id", ev.organization_id)
    .eq("is_test", false)
    .is("hidden_at", null)
    .is("deleted_at", null)
    // Booth: strip; Photo Stage (#180): foto pertama rombongan.
    .in("assets.kind", ["strip_web", "original"])
    .is("assets.hidden_at", null)
    .is("assets.review_status", null)
    .in("source", guestPhotosVisible(ev) ? ["booth", "stage", "guest"] : ["booth", "stage"])
    .order("started_at", { ascending: false })
    .limit(limit);
  const pick = (s: NonNullable<typeof rows>[number]) =>
    s.source === "booth"
      ? s.assets.find((a) => a.kind === "strip_web")
      : // Photo Stage: foto pertama rombongan; Guest Cam: foto terbaru tamu.
        s.assets
          .filter((a) => a.kind === "original")
          .sort((a, b) => (s.source === "guest" ? b.idx - a.idx : a.idx - b.idx))[0];
  const strips: LiveStrip[] = await Promise.all(
    (rows ?? []).flatMap((s) => {
      const a = pick(s);
      return a
        ? [
            (async () => ({
              id: s.id,
              at: s.started_at,
              ...(s.source === "guest" && s.group_name && { by: s.group_name }),
              url: await presignGet(a.r2_key.split("#")[0] ?? "", 3600),
            }))(),
          ]
        : [];
    }),
  );
  const branding = (ev.branding ?? {}) as { tagline?: string };
  const cam = EventSettingsSchema.safeParse(ev.settings ?? {}).data?.guestCam;
  let guest: LiveEvent["guest"] = null;
  if (cam?.enabled && ev.guest_token) {
    const [{ count: guests }, { count: photos }] = await Promise.all([
      db
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", ev.organization_id)
        .eq("event_id", ev.id)
        .eq("source", "guest")
        .is("deleted_at", null),
      db
        .from("assets")
        .select("id, sessions!inner(event_id, source)", { count: "exact", head: true })
        .eq("organization_id", ev.organization_id)
        .eq("kind", "original")
        .eq("sessions.event_id", ev.id)
        .eq("sessions.source", "guest"),
    ]);
    guest = { path: `/c/${ev.guest_token}`, photos: photos ?? 0, guests: guests ?? 0 };
  }
  return {
    event: {
      name: ev.name,
      tagline: branding.tagline ?? null,
      date: ev.event_date,
      publicGallery: ev.public_gallery,
      guest,
    } satisfies LiveEvent,
    strips,
  };
}
