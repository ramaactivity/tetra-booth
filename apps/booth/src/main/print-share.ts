import { randomInt, randomUUID } from "node:crypto";
import { createSocket } from "node:dgram";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { PaperSchema } from "@tetra/shared";
import { z } from "zod";
import type { Alerts } from "./alerts";
import { request, ServiceUnavailable } from "./camera-client";
import type { BoothDb } from "./db";

/**
 * Printer bersama lewat WiFi lokal (#261): satu laptop printer (pusat) mencetak untuk beberapa booth/Photo Stage di
 * jaringan yang sama, tanpa internet. Booth mengirim lembar cetak yang sudah jadi (JPEG) ke pusat; pusat mencatatnya
 * di `print_jobs` miliknya lalu mencetak lewat Camera Service seperti cetakan sendiri. Booth menemukan pusat lewat
 * siaran UDP (tanpa mengetik IP) dan mencarinya lagi kalau IP pusat berubah (router restart).
 */
export const HUB_PORT = 47880;
export const FIND_PORT = 47881;
const HELLO = "tetra-print?";
/** Lembar 1200×1800 JPEG ±1–3 MB; 40 MB = batas aman untuk lembar 4R resolusi tinggi. */
const MAX_BYTES = 40 * 1024 * 1024;

type Paper = z.infer<typeof PaperSchema>;
export type PrintPayload = { jobId: string; path: string; copies: number; paper: Paper };
const Job = z.object({
  jobId: z.string().regex(/^[\w-]{1,56}$/),
  copies: z.number().int().min(1).max(10),
  paper: PaperSchema,
});
export const HubStatus = z.object({
  id: z.string(),
  name: z.string(),
  printer: z.object({ status: z.string(), message: z.string().optional() }),
  paper: z.object({ remaining: z.number(), capacity: z.number() }),
  tone: z.unknown(),
});
export type HubStatus = z.infer<typeof HubStatus>;
const Found = z.object({
  t: z.literal("tetra-print"),
  id: z.string().max(64),
  name: z.string().max(80),
  port: z.number().int(),
});
export type FoundHub = { id: string; name: string; url: string };

const fromHeader = (req: IncomingMessage) => {
  try {
    return decodeURIComponent(String(req.headers["x-tetra-from"] ?? "")).slice(0, 60);
  } catch {
    return "";
  }
};

/** Pusat: server HTTP (cetak + status) dan penjawab pencarian UDP. */
export function startPrintHub(o: {
  id: string;
  key: string;
  name: () => string;
  /** Folder lembar kiriman booth (harus di bawah folder sesi supaya Cetak ulang crew jalan). */
  inbox: string;
  /** Job sudah tercatat (kiriman ulang booth setelah balasan hilang tidak mencetak dua kali). */
  has: (jobId: string) => boolean;
  print: (j: PrintPayload & { from: string }) => Promise<void>;
  status: () => Omit<HubStatus, "id" | "name">;
  log: (m: string) => void;
  port?: number;
  findPort?: number;
}): { port: () => number | null; peers: () => { name: string; at: number }[]; close: () => void } {
  const peers = new Map<string, number>();
  const inflight = new Set<string>();
  let port: number | null = null;

  const server: Server = createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.headers["x-tetra-key"] !== o.key) return send(403, { error: "kode printer salah" });
      const from = fromHeader(req);
      if (from) peers.set(from, Date.now());
      const path = new URL(req.url ?? "/", "http://hub").pathname;
      if (req.method === "GET" && path === "/status")
        return send(200, { id: o.id, name: o.name(), ...o.status() });
      if (req.method !== "POST" || path !== "/print") return send(404, { error: "not found" });
      const h = Job.safeParse({
        jobId: req.headers["x-tetra-job"],
        copies: Number(req.headers["x-tetra-copies"]),
        paper: req.headers["x-tetra-paper"],
      });
      if (!h.success) return send(400, { error: "job tidak valid" });
      const jobId = `lan-${h.data.jobId}`;
      if (o.has(jobId) || inflight.has(jobId)) {
        req.resume();
        return send(200, { ok: true });
      }
      inflight.add(jobId);
      try {
        const chunks: Buffer[] = [];
        let n = 0;
        for await (const c of req as AsyncIterable<Buffer>) {
          n += c.length;
          if (n > MAX_BYTES) return send(413, { error: "file terlalu besar" });
          chunks.push(c);
        }
        const body = Buffer.concat(chunks);
        if (body[0] !== 0xff || body[1] !== 0xd8) return send(400, { error: "bukan JPEG" });
        await mkdir(o.inbox, { recursive: true });
        const file = join(o.inbox, `${jobId}.jpg`);
        await writeFile(file, body);
        o.log(
          `[print-share] terima ${jobId} dari ${from || "?"}: ${h.data.copies}× ${h.data.paper}`,
        );
        // File tersimpan = pusat bertanggung jawab. Gagal cetak tampil di daftar Cetak gagal pusat (bisa Cetak ulang),
        // jadi booth tetap dijawab ok supaya tidak mengirim ulang.
        await o.print({ ...h.data, jobId, path: file, from }).catch((e: unknown) => {
          o.log(`[print-share] ${jobId} gagal diserahkan ke printer: ${String(e)}`);
        });
        return send(200, { ok: true });
      } finally {
        inflight.delete(jobId);
      }
    } catch (e) {
      o.log(`[print-share] error: ${String(e)}`);
      if (!res.headersSent) send(500, { error: "server" });
    }
  });
  server.on("error", (e) => o.log(`[print-share] server pusat gagal: ${e.message}`));
  server.listen(o.port ?? HUB_PORT, "0.0.0.0", () => {
    const a = server.address();
    port = typeof a === "object" && a ? a.port : null;
    o.log(`[print-share] pusat printer aktif di port ${port}`);
  });

  const udp = createSocket({ type: "udp4", reuseAddr: true });
  udp.on("message", (m, r) => {
    if (m.toString() !== HELLO || !port) return;
    const reply = JSON.stringify({ t: "tetra-print", id: o.id, name: o.name(), port });
    udp.send(reply, r.port, r.address);
  });
  udp.on("error", (e) => o.log(`[print-share] pencarian UDP tidak aktif: ${e.message}`));
  udp.bind(o.findPort ?? FIND_PORT);

  return {
    port: () => port,
    peers: () => [...peers].map(([name, at]) => ({ name, at })),
    close: () => {
      server.close();
      udp.close();
    },
  };
}

/** Alamat siaran tiap jaringan laptop (WiFi/LAN/hotspot) + siaran umum. */
export function broadcastAddresses(): string[] {
  const out = new Set(["255.255.255.255"]);
  for (const a of Object.values(networkInterfaces()).flat()) {
    if (!a || a.family !== "IPv4" || a.internal) continue;
    const ip = a.address.split(".").map(Number);
    const mask = a.netmask.split(".").map(Number);
    out.add(ip.map((b, i) => (b & (mask[i] ?? 0)) | (~(mask[i] ?? 0) & 255)).join("."));
  }
  return [...out];
}

/** Cari laptop printer di jaringan yang sama: kirim siaran, kumpulkan jawaban selama `ms`. */
export function findHubs(
  ms = 1500,
  targets = broadcastAddresses(),
  findPort = FIND_PORT,
): Promise<FoundHub[]> {
  return new Promise((resolve) => {
    const out = new Map<string, FoundHub>();
    const s = createSocket("udp4");
    s.on("message", (m, r) => {
      try {
        const x = Found.parse(JSON.parse(m.toString()));
        out.set(x.id, { id: x.id, name: x.name, url: `http://${r.address}:${x.port}` });
      } catch {}
    });
    s.on("error", () => {});
    s.bind(0, () => {
      s.setBroadcast(true);
      for (const t of targets) s.send(HELLO, findPort, t, () => {});
    });
    setTimeout(() => {
      s.close();
      resolve([...out.values()]);
    }, ms);
  });
}

export type HubTarget = { id: string; name: string; key: string; url: string };
export type HubState = HubStatus | "badkey" | null;

/** Cek satu laptop printer dengan kode (sebelum disimpan di mode crew). */
export async function checkHub(url: string, key: string, from: string): Promise<HubState> {
  try {
    const r = await fetch(`${url}/status`, {
      headers: { "x-tetra-key": key, "x-tetra-from": encodeURIComponent(from) },
      signal: AbortSignal.timeout(4000),
    });
    if (r.status === 403) return "badkey";
    return r.ok ? HubStatus.parse(await r.json()) : null;
  } catch {
    return null;
  }
}

/** Booth yang mencetak lewat laptop printer: kirim lembar, pantau status pusat, cari ulang kalau IP berubah. */
export function createHubClient(o: {
  hub: HubTarget;
  from: () => string;
  log: (m: string) => void;
  find?: () => Promise<FoundHub[]>;
}) {
  let url = o.hub.url;
  let last: HubState = null;
  let finding: Promise<unknown> | null = null;
  const rediscover = () => {
    finding ??= (o.find ?? findHubs)()
      .then((hubs) => {
        const h = hubs.find((x) => x.id === o.hub.id);
        if (h && h.url !== url) {
          o.log(`[print-share] ${o.hub.name} pindah alamat: ${url} → ${h.url}`);
          url = h.url;
        }
      })
      .catch(() => {})
      .finally(() => {
        finding = null;
      });
    return finding;
  };
  return {
    hub: o.hub,
    url: () => url,
    last: () => last,
    async poll(): Promise<HubState> {
      last = await checkHub(url, o.hub.key, o.from());
      if (last === null) await rediscover();
      return last;
    },
    /** Tidak terjangkau = ServiceUnavailable (job tetap antre, dikirim ulang); kode salah = Error (job gagal). */
    async submit(j: PrintPayload): Promise<void> {
      const body = await readFile(j.path);
      let r: Response;
      try {
        r = await fetch(`${url}/print`, {
          method: "POST",
          body,
          headers: {
            "content-type": "image/jpeg",
            "x-tetra-key": o.hub.key,
            "x-tetra-from": encodeURIComponent(o.from()),
            "x-tetra-job": j.jobId,
            "x-tetra-copies": String(j.copies),
            "x-tetra-paper": j.paper,
          },
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        void rediscover();
        throw new ServiceUnavailable(`${o.hub.name} tidak terjangkau`);
      }
      if (r.status === 403) throw new Error(`kode printer ${o.hub.name} salah`);
      if (!r.ok) throw new ServiceUnavailable(`${o.hub.name} menjawab ${r.status}`);
    },
  };
}
export type HubClient = ReturnType<typeof createHubClient>;

let client: HubClient | null = null;
let onSent: (jobId: string) => void = () => {};
/** Booth ini mencetak lewat laptop printer (dipasang sekali di index). `sent` = job diterima pusat. */
export function printViaHub(c: HubClient, sent: (jobId: string) => void) {
  client = c;
  onSent = sent;
}
export const hubClient = () => client;

/**
 * Satu pintu semua jalur cetak (sesi, galeri, Cetak ulang crew, kirim ulang setelah Camera Service pulih): printer
 * lokal lewat Camera Service, atau laptop printer. Kembalikan `accepted`.
 */
export async function submitPrint(p: PrintPayload): Promise<boolean> {
  if (!client) {
    const r = await request({ id: randomUUID(), type: "print.submit", payload: p });
    return r.accepted;
  }
  await client.submit(p);
  onSent(p.jobId);
  return true;
}

/** Kertas di laptop printer & status bersama yang ditampilkan di mode crew (#261). */
export type PrintShareInfo =
  | { mode: "local" }
  | {
      mode: "hub";
      name: string;
      key: string;
      urls: string[];
      peers: { name: string; secAgo: number }[];
    }
  | { mode: "remote"; name: string; state: "ok" | "unreachable" | "badkey"; pending: number };

/** Antrean booth menunggu laptop printer: dikirim ulang urut selama 6 jam (WiFi putus lama tetap tercetak). */
const REMOTE_WINDOW_MS = 6 * 3600_000;
const POLL_MS = 5000;

const lanIps = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => a?.address ?? "");

/** Pasang printer bersama sesuai device.json; kembalikan info untuk mode crew + sinkron warna cetakan. */
export function setupPrintShare(o: {
  mode: "local" | "hub" | "remote";
  hub?: HubTarget | undefined;
  db: BoothDb;
  alerts: Alerts;
  name: () => string;
  inbox: string;
  sendPrint: (j: PrintPayload & { sessionId: string }) => Promise<void>;
  log: (m: string) => void;
}): { info: () => PrintShareInfo; tone: (local: unknown) => unknown } {
  const kv = o.db.kv;
  if (o.mode === "hub") {
    const once = (k: string, make: () => string) => {
      const v = kv.get(k) || make();
      kv.set(k, v);
      return v;
    };
    // Tetap per laptop: booth yang sudah terhubung tidak perlu dihubungkan ulang setelah pusat dibuka ulang.
    const id = once("print_hub_id", () => randomUUID().slice(0, 8));
    const key = once("print_hub_key", () => String(randomInt(1000, 10000)));
    const tone = () => {
      try {
        return JSON.parse(kv.get("print_tone") ?? "null");
      } catch {
        return null;
      }
    };
    const srv = startPrintHub({
      id,
      key,
      name: o.name,
      inbox: o.inbox,
      has: (j) => o.db.printStatus(j) !== undefined,
      print: (j) => o.sendPrint({ ...j, sessionId: j.jobId }),
      status: () => ({ printer: o.alerts.printer(), paper: o.alerts.paper(), tone: tone() }),
      log: o.log,
    });
    return {
      info: () => {
        const port = srv.port();
        return {
          mode: "hub",
          name: o.name(),
          key,
          urls: port ? lanIps().map((a) => `${a}:${port}`) : [],
          peers: srv
            .peers()
            .map((p) => ({ name: p.name, secAgo: Math.round((Date.now() - p.at) / 1000) }))
            .sort((a, b) => a.secAgo - b.secAgo),
        };
      },
      // Warna cetakan dikalibrasi di laptop printer; booth yang mengirim memakai nilai ini.
      tone: (local) => {
        kv.set("print_tone", JSON.stringify(local ?? null));
        return null;
      },
    };
  }
  if (o.mode !== "remote" || !o.hub) return { info: () => ({ mode: "local" }), tone: () => null };

  const hub = o.hub;
  const c = createHubClient({ hub, from: o.name, log: o.log });
  let lastOk: HubStatus | null = null;
  o.alerts.viaHub(() => lastOk?.paper ?? { remaining: 0, capacity: 0 });
  printViaHub(c, (jobId) => {
    o.db.printJobResult(jobId, "done");
    o.alerts.onPrintDone(jobId);
  });
  const flush = async () => {
    const since = new Date(Date.now() - REMOTE_WINDOW_MS).toISOString();
    for (const j of o.db.pendingPrints(since, Number.MAX_SAFE_INTEGER)) {
      try {
        await submitPrint({
          jobId: j.id,
          path: j.path,
          copies: j.copies,
          paper: j.paper === "4R" ? "4R" : "2x6x2",
        });
        o.log(`[print-share] terkirim (antrean) ${j.id} → ${hub.name}`);
      } catch (e) {
        if (e instanceof ServiceUnavailable) return;
        const msg = e instanceof Error ? e.message : String(e);
        o.db.printJobResult(j.id, "failed", msg);
        o.alerts.onPrintFailed(j.id, msg);
      }
    }
  };
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const st = await c.poll();
      if (st === "badkey")
        o.alerts.onHubStatus("error", `Kode printer ${hub.name} salah, hubungkan ulang`);
      else if (st === null)
        o.alerts.onHubStatus("unavailable", `${hub.name} tidak terjangkau, cek WiFi`);
      else {
        lastOk = st;
        o.alerts.onHubStatus(st.printer.status, st.printer.message);
        await flush();
      }
    } finally {
      busy = false;
    }
  };
  void tick();
  setInterval(() => void tick(), POLL_MS).unref();
  return {
    info: () => {
      const st = c.last();
      return {
        mode: "remote",
        name: hub.name,
        state: st === "badkey" ? "badkey" : st ? "ok" : "unreachable",
        pending: o.db.printsInFlight(new Date(Date.now() - REMOTE_WINDOW_MS).toISOString()),
      };
    },
    tone: () => lastOk?.tone ?? null,
  };
}
