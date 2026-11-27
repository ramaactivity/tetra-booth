import { SESSION_ID_PATTERN } from "@tetra/shared";
import { downloadZip, predictLength } from "client-zip";
import { after } from "next/server";
import { allRows } from "@/lib/all-rows";
import { apiError, clientIp, rateOk } from "@/lib/booth";
import { isBot, trackClient } from "@/lib/client-track";
import { guestPhotosVisible } from "@/lib/events";
import { eventByClientToken } from "@/lib/gallery";
import { getStream, objectBytes } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase/service";

// Batas Vercel Hobby + Fluid (300 dtk). Dulu 60 dtk: di koneksi lambat stream diputus di tengah dan klien
// menerima ZIP setengah tanpa tanda gagal (Wedding Iqbal & Ceca, 129 dari 144 MB).
export const maxDuration = 300;

const KINDS = {
  strip: ["strip_web"],
  original: ["original"],
  stage: ["original"],
  guest: ["original", "strip_web"],
} as const;

/**
 * Unduh semua foto galeri klien sebagai ZIP (FSD §3 "Download semua", TSD §7), di-stream langsung dari R2
 * tanpa kompresi (JPEG). Content-Length dihitung di depan (HEAD tiap objek + predictLength), jadi kalau unduhan
 * terputus browser menandainya GAGAL, bukan menyimpan ZIP rusak. ponytail: masih dibatasi durasi function
 * Vercel (300 dtk ≈ 600 MB di 2 MB/dtk); event lebih besar dari itu → ZIP dibuat di background ke R2.
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
  // "Unduh semua" klien (ringkasan event): hanya unduhan seluruh galeri, bukan per rombongan.
  if (!one && !isBot(req.headers.get("user-agent"))) after(() => trackClient(ev.id, "zip"));
  const db = createServiceClient();
  const query = () =>
    db
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
      // Sesi uji crew tidak tampil di galeri, jadi tidak ikut ZIP juga (sama dengan galleryOf).
      .eq("sessions.is_test", false)
      .is("sessions.hidden_at", null)
      .is("sessions.deleted_at", null);
  // Semua baris, bukan 1000 pertama (max_rows PostgREST, audit 27 Nov: ZIP acara besar terpotong).
  const data = await allRows((from, to) =>
    (one ? query().eq("sessions.id", one) : query()).order("id").range(from, to),
  );
  const sorted = data.sort((a, b) => a.sessions.started_at.localeCompare(b.sessions.started_at));
  // Ukuran tiap objek di depan (untuk Content-Length). Objek yang hilang (belum terunggah / dibersihkan)
  // dilewati di sini, bukan di tengah stream (#253) — kalau dilewati di tengah, Content-Length meleset.
  const r2Key = (k: string) => k.split("#")[0] ?? k;
  const sizes: (number | null)[] = [];
  for (let i = 0; i < sorted.length; i += 32)
    sizes.push(
      ...(await Promise.all(sorted.slice(i, i + 32).map((a) => objectBytes(r2Key(a.r2_key))))),
    );
  const rows = sorted.flatMap((a, i) => {
    const size = sizes[i];
    return size == null ? [] : [{ ...a, size }];
  });
  const meta = rows.map((a, n) => ({
    name:
      kind === "stage" || kind === "guest"
        ? `${String(n + 1).padStart(4, "0")}-${(a.sessions.group_name ?? "Tamu").replace(/[^\w .-]+/g, "").slice(0, 60)}-${kind === "guest" ? (a.kind === "strip_web" ? "strip-" : "foto-") : ""}${a.idx}.jpg`
        : `${String(n + 1).padStart(4, "0")}-${a.sessions.id}${kind === "original" ? `-${a.idx}` : ""}.jpg`,
    lastModified: new Date(a.sessions.started_at),
    size: a.size,
  }));
  async function* files() {
    for (const [n, m] of meta.entries()) {
      // Objek sudah dicek ada; gagal di sini = stream error → browser menandai unduhan gagal.
      const input = await getStream(r2Key(rows[n]?.r2_key ?? ""));
      if (!input) throw new Error(`zip: objek kosong ${rows[n]?.r2_key}`);
      yield { ...m, input };
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
      "content-length": String(predictLength(meta)),
      "content-disposition": `attachment; filename="${slug}-${kind}${one ? `-${one}` : ""}.zip"`,
    },
  });
}
