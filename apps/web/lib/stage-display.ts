import "server-only";
import { EventSettingsSchema } from "@tetra/shared";
import { byLink, LINK } from "./gallery";
import { clock } from "./guest";
import { presignGet } from "./r2";
import { createServiceClient } from "./supabase/service";

/**
 * Layar galeri Photo Stage di device kedua (#204): `/stage/{slug atau token live}`. Data dari cloud (foto stage
 * terunggah per foto sejak #202), dipakai laptop/tablet/smart TV yang jauh dari laptop kamera. Aktif selama link live
 * aktif. Rombongan terbaru dulu (maks. 60), foto & aset tersembunyi tidak ikut.
 */
export type StageDisplayGroup = {
  id: string;
  label: string;
  time: string;
  /** Jepretan terakhir yang sudah sampai cloud (ms epoch). */
  lastAt: number;
  photos: { thumb: string; full: string }[];
};
export type StageDisplay = {
  event: { name: string; tagline: string | null; date: string; publicGallery: boolean };
  /** Lama rombongan terbaru tampil besar setelah foto terakhirnya (detik). */
  activeSec: number;
  groups: StageDisplayGroup[];
};

const key = (k: string) => k.split("#")[0] ?? k;

export async function loadStageDisplay(token: string): Promise<StageDisplay | null> {
  if (!LINK.test(token)) return null;
  const db = createServiceClient();
  const { data: ev } = await db
    .from("events")
    .select("id, organization_id, name, event_date, branding, purged_at, public_gallery, settings")
    .or(byLink("live_token", token))
    .not("live_token", "is", null)
    .limit(1)
    .maybeSingle();
  if (!ev || ev.purged_at) return null;
  const { data: rows } = await db
    .from("sessions")
    .select("id, started_at, group_name, assets!inner(kind, idx, r2_key, created_at)")
    .eq("event_id", ev.id)
    .eq("organization_id", ev.organization_id)
    .eq("source", "stage")
    .eq("is_test", false)
    .is("hidden_at", null)
    .is("deleted_at", null)
    .in("assets.kind", ["original", "thumb_original"])
    .is("assets.hidden_at", null)
    .order("started_at", { ascending: false })
    .limit(60);
  const groups = await Promise.all(
    (rows ?? []).map(async (s): Promise<StageDisplayGroup | null> => {
      const originals = s.assets.filter((a) => a.kind === "original").sort((a, b) => a.idx - b.idx);
      if (!originals.length) return null;
      const thumbOf = (idx: number) =>
        s.assets.find((a) => a.kind === "thumb_original" && a.idx === idx);
      return {
        id: s.id,
        label: s.group_name ?? `Tamu · ${clock(s.started_at)}`,
        time: clock(s.started_at),
        lastAt: Math.max(...s.assets.map((a) => new Date(a.created_at).getTime())),
        photos: await Promise.all(
          originals.map(async (a) => ({
            full: await presignGet(key(a.r2_key), 3600),
            thumb: await presignGet(key(thumbOf(a.idx)?.r2_key ?? a.r2_key), 3600),
          })),
        ),
      };
    }),
  );
  const branding = (ev.branding ?? {}) as { tagline?: string };
  return {
    event: {
      name: ev.name,
      tagline: branding.tagline ?? null,
      date: ev.event_date,
      publicGallery: ev.public_gallery,
    },
    activeSec: EventSettingsSchema.safeParse(ev.settings ?? {}).data?.stageTvSec ?? 30,
    groups: groups.filter((g): g is StageDisplayGroup => !!g),
  };
}
