import { SESSION_ID_PATTERN } from "@tetra/shared";
import { downloadZip } from "client-zip";
import { apiError, clientIp, rateOk } from "@/lib/booth";
import { guestPhotosVisible } from "@/lib/events";
import { eventByClientToken } from "@/lib/gallery";
import { getStream } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase/service";

export const maxDuration = 60;

const KINDS = {
  strip: ["strip_web"],
  original: ["original"],
  stage: ["original"],
  guest: ["original", "strip_web"],
} as const;

/**
 * Unduh semua foto galeri klien sebagai ZIP (FSD §3 "Download semua", TSD §7), di-stream langsung dari R2
 * tanpa kompresi (JPEG). ponytail: dibatasi durasi function Vercel; event sangat besar → worker ZIP terpisah.
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (!(await rateOk(`zip:${clientIp(req)}`, 600, 10))) return apiError("rate_limited", 429);
  const ev = await eventByClientToken((await ctx.params).token);
  if (!ev) return apiError("not_found", 404);
  const q = new URL(req.url).searchParams.get("kind");
  // Photo Stage (#180): foto fotografer pelaminan terpisah dari original booth.
  const kind = q === "original" || q === "stage" || q === "guest" ? q : "strip";
  // Guest Cam (#197): tertutup selama mode "setelah acara" belum dibuka.
  if (kind === "guest" && !guestPhotosVisible(ev)) return apiError("not_found", 404);
  // Unduh satu rombongan (#191): `session` = ID sesi stage di event ini.
  const one = new URL(req.url).searchParams.get("session");
  if (one && !SESSION_ID_PATTERN.test(one)) return apiError("bad_request", 400);
  let sel = createServiceClient()
    .from("assets")
    .select(
      "kind, idx, r2_key, sessions!inner(id, event_id, started_at, hidden_at, deleted_at, source, group_name)",
    )
    .eq("organization_id", ev.organization_id)
    .in("kind", KINDS[kind])
    .is("hidden_at", null)
    .is("review_status", null)
    .eq("sessions.event_id", ev.id)
    .eq("sessions.source", kind === "stage" || kind === "guest" ? kind : "booth")
    .is("sessions.hidden_at", null)
    .is("sessions.deleted_at", null)
    .limit(5000);
  if (one) sel = sel.eq("sessions.id", one);
  const { data } = await sel;
  const rows = (data ?? []).sort((a, b) =>
    a.sessions.started_at.localeCompare(b.sessions.started_at),
  );
  async function* files() {
    for (const [n, a] of rows.entries()) {
      const input = await getStream(a.r2_key.split("#")[0] ?? a.r2_key);
      if (!input) continue;
      yield {
        name:
          kind === "stage" || kind === "guest"
            ? `${String(n + 1).padStart(4, "0")}-${(a.sessions.group_name ?? "Tamu").replace(/[^\w .-]+/g, "").slice(0, 60)}-${kind === "guest" ? (a.kind === "strip_web" ? "strip-" : "foto-") : ""}${a.idx}.jpg`
            : `${String(n + 1).padStart(4, "0")}-${a.sessions.id}${kind === "original" ? `-${a.idx}` : ""}.jpg`,
        lastModified: new Date(a.sessions.started_at),
        input,
      };
    }
  }
  const slug =
    ev.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "galeri";
  return new Response(downloadZip(files()).body, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${slug}-${kind}${one ? `-${one}` : ""}.zip"`,
    },
  });
}
