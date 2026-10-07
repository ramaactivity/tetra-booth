import "server-only";
import { byLink, LINK } from "@/lib/gallery";
import { presignGet } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase/service";

/** Live slideshow `/live/{slug atau token}` (FSD §4, desain D1): strip terbaru event yang tidak disembunyikan. */
export type LiveStrip = { id: string; url: string; at: string };
/** `publicGallery`: QR ke galeri publik `/l/{token}` tampil di slideshow (DECISIONS #75). */
export type LiveEvent = {
  name: string;
  tagline: string | null;
  date: string;
  publicGallery: boolean;
};

export async function loadLive(token: string, limit = 24) {
  if (!LINK.test(token)) return null;
  const db = createServiceClient();
  const { data: ev } = await db
    .from("events")
    .select("id, organization_id, name, event_date, branding, purged_at, public_gallery")
    .or(byLink("live_token", token))
    .not("live_token", "is", null)
    .limit(1)
    .maybeSingle();
  if (!ev || ev.purged_at) return null;
  const { data: rows } = await db
    .from("sessions")
    .select("id, started_at, source, assets!inner(kind, idx, r2_key)")
    .eq("event_id", ev.id)
    .eq("organization_id", ev.organization_id)
    .eq("is_test", false)
    .is("hidden_at", null)
    .is("deleted_at", null)
    // Booth: strip; Photo Stage (#180): foto pertama rombongan.
    .in("assets.kind", ["strip_web", "original"])
    .order("started_at", { ascending: false })
    .limit(limit);
  const pick = (s: NonNullable<typeof rows>[number]) =>
    s.source === "stage"
      ? s.assets.filter((a) => a.kind === "original").sort((a, b) => a.idx - b.idx)[0]
      : s.assets.find((a) => a.kind === "strip_web");
  const strips: LiveStrip[] = await Promise.all(
    (rows ?? []).flatMap((s) => {
      const a = pick(s);
      return a
        ? [
            (async () => ({
              id: s.id,
              at: s.started_at,
              url: await presignGet(a.r2_key.split("#")[0] ?? "", 3600),
            }))(),
          ]
        : [];
    }),
  );
  const branding = (ev.branding ?? {}) as { tagline?: string };
  return {
    event: {
      name: ev.name,
      tagline: branding.tagline ?? null,
      date: ev.event_date,
      publicGallery: ev.public_gallery,
    } satisfies LiveEvent,
    strips,
  };
}
