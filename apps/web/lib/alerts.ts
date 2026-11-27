import { BoothStatus, parseRun, runState } from "@tetra/shared";
import { PAPER_LOW, unsentByEvent } from "./booth-health";
import { ymdWib } from "./events";
import { isOnline } from "./format";

/**
 * Notifikasi WA owner lewat Hermes (audit 27 Nov, kontrak dengan sesi Hermes): booth menentukan apa yang penting,
 * Hermes hanya polling `/api/hermes/alerts` dan meneruskan ke grup admin. Hanya alert yang MASIH relevan (bot bisa
 * offline dan pesan menunggu antrean). `id` stabil per kejadian; yang sudah di-ack tidak dikirim lagi.
 */
export type Alert = {
  id: string;
  kind: "paper_low" | "booth_offline" | "unsent" | "gallery_expiring";
  text: string;
  at: string;
  eventName?: string;
  booth?: string;
};
type Device = {
  id: string;
  name: string;
  short_code: string | null;
  last_seen_at: string | null;
  status: unknown;
};
type Event = {
  id: string;
  name: string;
  event_date: string;
  run: unknown;
  client_token: string | null;
  client_expires_at: string | null;
};

export const OFFLINE_AFTER_MS = 10 * 60_000;
const DAY = 86_400_000;
const WIB = { timeZone: "Asia/Jakarta" } as const;
const clock = (ms: number) =>
  new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", ...WIB }).format(ms);
const day = (ms: number) =>
  new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...WIB,
  }).format(ms);
/** Jam tenang untuk alert yang tidak mendesak: hanya 08.00–21.00 WIB. */
const daytime = (now: number) => {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", ...WIB }).format(now),
  );
  return h >= 8 && h < 21;
};
const boothName = (d: Device) => [d.name, d.short_code].filter(Boolean).join(" · ");

export function boothAlerts(
  devices: Device[],
  events: Event[],
  now: number,
  /** Event yang galeri kliennya pernah dibuka klien (gallery_open). */
  opened: Set<string> = new Set(),
): Alert[] {
  const out: Alert[] = [];
  const at = new Date(now).toISOString();
  const today = ymdWib(now);
  const running = new Map(
    events
      .filter((e) => ["running", "paused"].includes(runState(parseRun(e.run))))
      .map((e) => [e.id, e]),
  );
  for (const d of devices) {
    const st = BoothStatus.safeParse(d.status).data;
    const e = st?.activeEvent ? running.get(st.activeEvent) : undefined;
    if (!e) continue;
    const booth = boothName(d);
    const last = d.last_seen_at ? Date.parse(d.last_seen_at) : 0;
    if (!isOnline(d.last_seen_at, now)) {
      // Episode offline baru = id baru (jam terakhir terlihat ikut di id).
      if (last && now - last >= OFFLINE_AFTER_MS && now - last < 12 * 3600_000)
        out.push({
          id: `booth_offline:${d.id}:${e.id}:${d.last_seen_at}`,
          kind: "booth_offline",
          text: `*Booth offline* · ${booth} tidak mengirim kabar sejak ${clock(last)} (${Math.round((now - last) / 60_000)} menit), acara ${e.name} masih jalan. Cek laptop & internet booth.`,
          at,
          eventName: e.name,
          booth,
        });
      continue;
    }
    if (st?.paper && st.paper.remaining <= PAPER_LOW)
      out.push({
        id: `paper_low:${d.id}:${e.id}`,
        kind: "paper_low",
        text: `*Kertas menipis* · ${booth}: tinggal ${st.paper.remaining} lembar, acara ${e.name} masih jalan. Siapkan roll baru.`,
        at,
        eventName: e.name,
        booth,
      });
  }
  if (!daytime(now)) return out;
  const unsent = unsentByEvent(devices, now);
  for (const e of events) {
    const state = runState(parseRun(e.run));
    const over =
      state === "finished" || (e.event_date < today && state !== "running" && state !== "paused");
    const u = unsent.get(e.id);
    if (over && u?.length && now - Date.parse(`${e.event_date}T00:00:00+07:00`) < 30 * DAY) {
      const n = u.reduce((a, x) => a + x.sessions, 0);
      out.push({
        id: `unsent:${e.id}`,
        kind: "unsent",
        text: `*Foto belum terkirim* · ${e.name}: ${n} sesi masih di laptop (${u.map((x) => x.device).join(", ")}). Nyalakan laptop booth & sambungkan internet sampai Backstage menulis "Semua terkirim".`,
        at,
        eventName: e.name,
      });
    }
    const exp = e.client_token && e.client_expires_at ? Date.parse(e.client_expires_at) : 0;
    if (exp > now && exp - now <= 3 * DAY)
      out.push({
        id: `gallery_expiring:${e.id}:${e.client_expires_at}`,
        kind: "gallery_expiring",
        text: `*Galeri klien hampir berakhir* · ${e.name}: link galeri berhenti ${day(exp)}. ${opened.has(e.id) ? "Ingatkan" : "Klien belum pernah membukanya, ingatkan"} klien untuk mengunduh semua foto.`,
        at,
        eventName: e.name,
      });
  }
  return out;
}
