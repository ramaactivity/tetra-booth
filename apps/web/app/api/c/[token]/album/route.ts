import { apiError } from "@/lib/booth";
import { guestEvent, guestRevealed, guestSession } from "@/lib/guest-cam";
import { presignGet } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase/service";

type Ctx = { params: Promise<{ token: string }> };
const key = (k: string) => k.split("#")[0] ?? k;

/**
 * Tab "Album acara" di halaman tamu (#209): foto Guest Cam semua tamu yang sudah boleh dilihat & disetujui,
 * ditambah foto booth/Photo Stage kalau klien membuka galeri publik. Hanya untuk tamu yang sudah bergabung.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const ev = await guestEvent((await ctx.params).token);
  if (!ev) return apiError("not_found", 404);
  if (!(await guestSession(ev))) return apiError("unauthorized", 401);
  if (!guestRevealed(ev)) return Response.json({ items: [], revealed: false });
  const sources = ev.public_gallery ? ["guest", "booth", "stage"] : ["guest"];
  const { data } = await createServiceClient()
    .from("assets")
    .select(
      "id, kind, idx, r2_key, created_at, sessions!inner(event_id, source, group_name, is_test, hidden_at, deleted_at)",
    )
    .eq("organization_id", ev.organization_id)
    .eq("sessions.event_id", ev.id)
    .in("sessions.source", sources)
    .eq("sessions.is_test", false)
    .is("sessions.hidden_at", null)
    .is("sessions.deleted_at", null)
    .in("kind", ["thumb_original", "thumb_strip"])
    .is("hidden_at", null)
    .is("review_status", null)
    .order("created_at", { ascending: false })
    .limit(300);
  const items = await Promise.all(
    (data ?? []).map(async (a) => ({
      id: a.id,
      strip: a.kind === "thumb_strip",
      /** Tab terpisah di album tamu (#247): Snapbook (HP tamu) vs Photobooth (booth/Photo Stage). */
      source: a.sessions.source === "guest" ? "snapbook" : "booth",
      by: a.sessions.source === "guest" ? (a.sessions.group_name ?? "Tamu") : "Photobooth",
      thumb: await presignGet(key(a.r2_key), 6 * 3600),
      url: await presignGet(
        key(a.r2_key).replace(
          /\/thumb_(original|strip)_/,
          (_, k) => `/${k === "original" ? "original" : "strip_web"}_`,
        ),
        6 * 3600,
      ),
    })),
  );
  return Response.json({ items, revealed: true });
}
