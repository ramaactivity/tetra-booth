import { randomInt } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, join, normalize, sep } from "node:path";
import { SESSION_ID_PATTERN } from "@tetra/shared";
import { nativeImage } from "electron";
import { z } from "zod";

/**
 * Layar Photo Stage di device kedua lewat WiFi/hotspot tanpa internet (#205, opsi B dari #204): laptop stage
 * menyajikan renderer yang sama (`/` → StageTv mode browser) + keadaan TV (`/api/tv`) + foto kamera yang diperkecil
 * (`/api/file?path=…`, hanya dari folder sesi). Device lain cukup membuka `http://<IP laptop>:47870`.
 * Windows menanyakan izin firewall sekali (pilih jaringan Private).
 */
const PORTS = [47870, 47871, 47872];
const Helper = z.union([
  z.object({
    key: z.string(),
    kind: z.literal("rename"),
    id: z.string().regex(SESSION_ID_PATTERN),
    name: z.string().max(120),
  }),
  z.object({ key: z.string(), kind: z.literal("pick"), name: z.string().min(1).max(120) }),
]);
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
};

/** Alamat IPv4 laptop di jaringan lokal (WiFi/LAN/hotspot), tanpa loopback. */
export const lanAddresses = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => a?.address ?? "")
    .filter(Boolean);

let livePort: number | null = null;
/** Kode HP helper (#206): acak per jalan, ditampilkan di laptop; tamu di WiFi yang sama tidak bisa mengubah nama. */
const helperKey = String(1000 + randomInt(9000));
export const stageHelperKey = () => helperKey;
/** Alamat layar WiFi yang sedang aktif (untuk operator & wizard); kosong = belum/tidak aktif. */
export const stageLanUrls = () =>
  livePort ? lanAddresses().map((a) => `http://${a}:${livePort}`) : [];

export function startStageLan(o: {
  rendererDir: string;
  sessionsRoot: () => string;
  state: () => unknown;
  /** Perintah HP helper yang sudah divalidasi (#206), diteruskan ke layar operator. */
  remote: (
    m: { kind: "rename"; id: string; name: string } | { kind: "pick"; name: string },
  ) => void;
  log: (m: string) => void;
}): { port: () => number | null; close: () => void } {
  let port: number | null = null;
  let server: Server | null = null;

  const handler = async (
    url: URL,
    post?: string,
  ): Promise<{ status: number; type: string; body: Buffer | string }> => {
    if (url.pathname === "/api/helper") {
      const m = Helper.safeParse(JSON.parse(post || "null"));
      if (!m.success || m.data.key !== helperKey)
        return { status: 403, type: "application/json", body: '{"error":"kode salah"}' };
      const { key: _, ...cmd } = m.data;
      o.remote(cmd);
      return { status: 200, type: "application/json", body: '{"ok":true}' };
    }
    if (url.pathname === "/api/tv")
      return { status: 200, type: "application/json", body: JSON.stringify(o.state() ?? null) };
    if (url.pathname === "/api/file") {
      const root = o.sessionsRoot();
      const abs = normalize(url.searchParams.get("path") ?? "");
      if (!abs.startsWith(root + sep))
        return { status: 403, type: "text/plain", body: "forbidden" };
      // Foto kamera bisa 6000 px / 8 MB: perkecil ke 1280 px supaya ringan lewat WiFi.
      const img = nativeImage.createFromPath(abs);
      if (img.isEmpty()) return { status: 404, type: "text/plain", body: "not found" };
      const { width } = img.getSize();
      const small = width > 1280 ? img.resize({ width: 1280, quality: "good" }) : img;
      return { status: 200, type: "image/jpeg", body: small.toJPEG(85) };
    }
    const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const file = normalize(join(o.rendererDir, rel));
    if (!file.startsWith(o.rendererDir))
      return { status: 403, type: "text/plain", body: "forbidden" };
    try {
      return {
        status: 200,
        type: TYPES[extname(file)] ?? "application/octet-stream",
        body: await readFile(file),
      };
    } catch {
      return { status: 404, type: "text/plain", body: "not found" };
    }
  };

  const listen = (i: number) => {
    const p = PORTS[i];
    if (p === undefined) {
      o.log("[stage-lan] semua port dipakai, layar WiFi tidak aktif");
      return;
    }
    const s = createServer(async (req, res) => {
      let post = "";
      if (req.method === "POST")
        for await (const c of req) {
          post += c;
          if (post.length > 4096) return void res.destroy();
        }
      void handler(new URL(req.url ?? "/", "http://lan"), post).then(
        (r) => {
          res.writeHead(r.status, { "content-type": r.type, "cache-control": "no-store" });
          res.end(r.body);
        },
        () => {
          res.writeHead(500);
          res.end();
        },
      );
    });
    s.once("error", () => listen(i + 1));
    s.listen(p, "0.0.0.0", () => {
      server = s;
      port = p;
      livePort = p;
      o.log(
        `[stage-lan] layar WiFi: ${
          lanAddresses()
            .map((a) => `http://${a}:${p}`)
            .join(", ") || `port ${p}`
        }`,
      );
    });
  };
  listen(0);
  return {
    port: () => port,
    close: () => server?.close(),
  };
}
