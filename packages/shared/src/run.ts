import { z } from "zod";

/**
 * Timer jalannya event (DECISIONS #149): data saja, booth tidak dibatasi. Disimpan di `events.run`.
 * Segmen = rentang berjalan; jeda = celah antar segmen. Dipakai server (admin + API booth), dashboard, rekap.
 */
const Iso = z.iso.datetime();
export const EventRun = z.object({
  segments: z.array(z.object({ start: Iso, end: Iso.optional() })).max(500),
  finishedAt: Iso.optional(),
  /** Id aksi booth yang sudah diterapkan (terakhir 50): kirim ulang = tidak berubah. */
  ids: z.array(z.string().max(64)).max(50).optional(),
});
export type EventRun = z.infer<typeof EventRun>;
export const EMPTY_RUN: EventRun = { segments: [] };
/** Baca kolom jsonb; rusak/kosong = belum mulai. */
export const parseRun = (v: unknown): EventRun => EventRun.safeParse(v).data ?? EMPTY_RUN;

/**
 * `open` = Buka untuk Tamu di booth: mulai / lanjutkan, kecuali event sudah selesai.
 * `start` = Mulai / Lanjutkan (juga membuka lagi event yang sudah selesai). `pause` = jeda. `finish` = selesai.
 */
export const RUN_ACTIONS = ["open", "start", "pause", "finish"] as const;
export type RunAction = (typeof RUN_ACTIONS)[number];
export type RunState = "idle" | "running" | "paused" | "finished";

/** POST /api/booth/events/:id/run. `at` = jam laptop booth saat crew menekan (bukan saat terkirim). */
export const BoothRunRequest = z.object({
  id: z.uuid(),
  action: z.enum(RUN_ACTIONS),
  at: Iso,
});
export type BoothRunRequest = z.infer<typeof BoothRunRequest>;
export const BoothRunResponse = z.object({
  state: z.enum(["idle", "running", "paused", "finished"]),
});

export function runState(run: EventRun): RunState {
  if (run.finishedAt) return "finished";
  const last = run.segments.at(-1);
  if (!last) return "idle";
  return last.end ? "paused" : "running";
}

const ms = (iso: string) => Date.parse(iso);
/** Jam booth yang lebih dari 2 menit di depan server dianggap salah → pakai jam server. */
const SKEW_MS = 2 * 60_000;

/**
 * Terapkan satu aksi. Waktu tidak pernah mundur melewati batas segmen terakhir (aksi offline yang datang
 * terlambat setelah aksi admin tetap menghasilkan segmen berurutan). Aksi yang tidak berlaku = tidak berubah.
 */
export function applyRun(
  run: EventRun,
  action: RunAction,
  at: string,
  now: number,
  id?: string,
): EventRun {
  if (id && run.ids?.includes(id)) return run;
  const last = run.segments.at(-1);
  const floor = last ? ms(last.end ?? last.start) : Number.NEGATIVE_INFINITY;
  const a = ms(at) > now + SKEW_MS ? now : ms(at);
  const iso = new Date(Math.max(a, floor)).toISOString();
  const state = runState(run);
  const segs = run.segments.slice();
  let next: EventRun = run;
  if (
    (action === "open" && (state === "idle" || state === "paused")) ||
    (action === "start" && state !== "running")
  ) {
    const { finishedAt: _, ...rest } = run;
    next = { ...rest, segments: [...segs, { start: iso }] };
  } else if ((action === "pause" || action === "finish") && state === "running" && last) {
    segs[segs.length - 1] = { start: last.start, end: iso };
    next = { ...run, segments: segs, ...(action === "finish" && { finishedAt: iso }) };
  } else if (action === "finish" && state === "paused") {
    next = { ...run, finishedAt: iso };
  }
  return id ? { ...next, ids: [...(run.ids ?? []), id].slice(-50) } : next;
}

/** Waktu berjalan (tanpa jeda) dalam ms; segmen terbuka dihitung sampai `now`. */
export const runElapsedMs = (run: EventRun, now: number) =>
  run.segments.reduce((a, s) => a + Math.max(0, (s.end ? ms(s.end) : now) - ms(s.start)), 0);

/** Total jeda = celah antar segmen (jeda yang sedang berlangsung dihitung sampai `now`, kecuali selesai). */
export function runPausedMs(run: EventRun, now: number) {
  let total = 0;
  run.segments.forEach((s, i) => {
    const prev = run.segments[i - 1];
    if (prev?.end) total += Math.max(0, ms(s.start) - ms(prev.end));
  });
  const last = run.segments.at(-1);
  if (last?.end && !run.finishedAt) total += Math.max(0, now - ms(last.end));
  return total;
}

/**
 * Koreksi manual owner/admin: jam mulai (awal segmen pertama) dan jam selesai (akhir segmen terakhir).
 * Belum pernah dimulai = satu segmen baru. Jeda di tengah tetap. null = urutan waktu tidak masuk akal.
 */
export function setRunTimes(
  run: EventRun,
  start: string,
  end: string | null,
  now: number,
): EventRun | null {
  const s = ms(start);
  const e = end ? ms(end) : null;
  if (Number.isNaN(s) || s > now + SKEW_MS || (e !== null && (Number.isNaN(e) || e <= s)))
    return null;
  const segs = run.segments.map((x) => ({ ...x }));
  if (!segs.length) {
    segs.push({ start, ...(end && { end }) });
  } else {
    const first = segs[0];
    const last = segs[segs.length - 1];
    if (!first || !last) return null;
    if (s >= (first.end ? ms(first.end) : now + SKEW_MS)) return null;
    first.start = start;
    if (end && e !== null) {
      if (e <= ms(last.start)) return null;
      last.end = end;
    }
  }
  return { ...run, segments: segs, ...(end && { finishedAt: end }) };
}

/** Selisih ≤ 5 menit dari durasi paket = sesuai paket. */
export const RUN_TOLERANCE_MIN = 5;
export type RunVerdict = { kind: "ok" | "over" | "under"; minutes: number };
/** Bandingkan durasi berjalan dengan paket (jam). */
export function runVerdict(elapsedMs: number, packageHours: number): RunVerdict {
  const diff = Math.round(elapsedMs / 60_000 - packageHours * 60);
  if (Math.abs(diff) <= RUN_TOLERANCE_MIN) return { kind: "ok", minutes: diff };
  return { kind: diff > 0 ? "over" : "under", minutes: Math.abs(diff) };
}

/** "3 jam 12 menit", "45 menit", "2 jam". */
export function durationText(totalMin: number) {
  const m = Math.max(0, Math.round(totalMin));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} menit`;
  return r ? `${h} jam ${r} menit` : `${h} jam`;
}
