import {
  clockOn,
  compareSchedule,
  durationText,
  type EventRun,
  fileSize,
  localHhmm,
  localYmd,
  type RunVerdict,
  runElapsedMs,
  runPausedMs,
  runState,
  runVerdict,
  type ScheduleCompare,
} from "@tetra/shared";

/**
 * Rekap event (DECISIONS #148): satu kartu bukti untuk owner (dipotret / diunduh / disalin ke WhatsApp).
 * Data dihitung server di dashboard; durasi & vonis dihitung saat kartu dibuka (event bisa masih berjalan).
 */
export type RecapData = {
  name: string;
  /** YYYY-MM-DD */
  date: string;
  venue: string | null;
  packageName: string | null;
  packageHours: number | null;
  booths: string[];
  designs: string[];
  sessions: number;
  prints: number;
  opened: number;
  saved: number;
  leads: number;
  photos: number;
  /** started_at sesi pertama / terakhir. */
  firstAt: string | null;
  lastAt: string | null;
  /** Sesi sebelum timer mulai / setelah acara dihentikan (#170). */
  outside: number;
  run: EventRun;
  /** Jadwal booking (#152) "HH:MM" waktu lokal venue (WIB); null = tidak diisi. */
  scheduledStart: string | null;
  scheduledEnd: string | null;
  /** Ukuran folder event di laptop booth (#166); null = belum dilaporkan booth. */
  local: { bytes: number; files: number } | null;
  /** Jumlah ukuran file sesi asli di cloud (#166). */
  cloudBytes: number;
};

const WIB = { timeZone: "Asia/Jakarta" } as const;
export const clockWib = (ts: string | number) =>
  new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", ...WIB }).format(
    new Date(ts),
  );
export const dateLong = (ymd: string) =>
  new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${ymd}T00:00:00Z`));
const stamp = (now: number) =>
  `${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", ...WIB }).format(now)}, ${clockWib(now)} WIB`;
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

export type RecapView = {
  /** Sumber durasi: timer event, atau perkiraan sesi pertama → terakhir. null = belum ada data. */
  source: "timer" | "sessions" | null;
  running: boolean;
  durationMs: number;
  startAt: string | null;
  endAt: string | null;
  /** Jam mulai/selesai untuk ditampilkan; hari lain dari hari acara ditulis dengan tanggal (#170). */
  startText: string;
  endText: string;
  pausedMs: number;
  verdict: RunVerdict | null;
  verdictText: string;
  verdictSub: string;
  /** Jadwal vs nyata (#152); null = jadwal kosong. */
  schedule: ScheduleCompare | null;
  packageText: string;
  stats: { label: string; value: string; note?: string }[];
  rows: { label: string; value: string }[];
  generated: string;
};

export function recapView(d: RecapData, now: number): RecapView {
  const st = runState(d.run);
  const first = d.run.segments[0];
  const last = d.run.segments.at(-1);
  const timer = !!first;
  const source = timer ? "timer" : d.firstAt && d.lastAt ? "sessions" : null;
  const durationMs = timer
    ? runElapsedMs(d.run, now)
    : d.firstAt && d.lastAt
      ? Date.parse(d.lastAt) - Date.parse(d.firstAt)
      : 0;
  const startAt = timer ? (first?.start ?? null) : d.firstAt;
  const endAt = timer ? (st === "running" ? null : (last?.end ?? null)) : d.lastAt;
  const verdict = source && d.packageHours ? runVerdict(durationMs, d.packageHours) : null;
  // Hari acara = hari timer mulai, atau tanggal event kalau timer belum pernah jalan (#170).
  const ref = first ? localYmd(first.start, WIB.timeZone) : d.date;
  const when = (ts: string | null) => (ts ? clockOn(ts, ref, WIB.timeZone) : "–");
  const dur = durationText(durationMs / 60_000);
  const packageText = d.packageHours ? durationText(d.packageHours * 60) : "";
  const verdictText = !source
    ? "Belum ada data jalannya event"
    : !verdict
      ? "Paket belum diisi"
      : verdict.kind === "ok"
        ? "Sesuai paket"
        : `${verdict.kind === "over" ? "Lebih" : "Kurang"} ${durationText(verdict.minutes)}`;
  const verdictSub = !source
    ? "Mulai timer di dashboard, atau crew menekan Buka untuk Tamu di booth."
    : `Jalan ${dur}${st === "running" ? " (masih berjalan)" : ""}${packageText ? ` dari paket ${packageText}` : ""}${source === "sessions" ? " · perkiraan dari sesi pertama sampai terakhir" : ""}`;
  return {
    source,
    running: st === "running",
    durationMs,
    startAt,
    endAt,
    startText: when(startAt),
    endText: when(endAt),
    pausedMs: timer ? runPausedMs(d.run, now) : 0,
    verdict,
    verdictText,
    verdictSub,
    schedule: compareSchedule(
      d.scheduledStart,
      d.scheduledEnd,
      startAt ? localHhmm(startAt, WIB.timeZone) : null,
      endAt ? localHhmm(endAt, WIB.timeZone) : null,
    ),
    packageText,
    stats: [
      {
        label: "Sesi",
        value: String(d.sessions),
        ...(d.outside > 0 && { note: `${d.outside} sesi di luar waktu acara` }),
      },
      { label: "Lembar dicetak", value: String(d.prints), note: "+ cetak ulang" },
      { label: "QR dibuka", value: `${pct(d.opened, d.sessions)}%`, note: `${d.opened} sesi` },
      { label: "Disimpan ke HP", value: `${pct(d.saved, d.sessions)}%`, note: `${d.saved} sesi` },
      { label: "Data tamu", value: String(d.leads) },
      { label: "Foto terunggah", value: String(d.photos) },
      { label: "Sesi pertama", value: when(d.firstAt) },
      { label: "Sesi terakhir", value: when(d.lastAt) },
    ],
    rows: [
      {
        label: "Paket",
        value: d.packageName
          ? `${d.packageName}${packageText ? ` · ${packageText}` : ""}`
          : packageText || "Belum diisi",
      },
      { label: "Booth", value: d.booths.join(", ") || "–" },
      { label: "Desain frame", value: d.designs.join(", ") || "–" },
      {
        label: "Ukuran di laptop",
        value: d.local
          ? `${fileSize(d.local.bytes)} (${d.local.files.toLocaleString("id-ID")} file)`
          : "Belum dilaporkan booth",
      },
      { label: "Ukuran di cloud", value: fileSize(d.cloudBytes) },
    ],
    generated: stamp(now),
  };
}

/** Ringkasan teks untuk WhatsApp (*tebal* ala WA, tanpa emoji). */
export function recapText(d: RecapData, now: number): string {
  const v = recapView(d, now);
  const lines = [
    `*Rekap Event · ${d.name}*`,
    [dateLong(d.date), d.venue].filter(Boolean).join(" · "),
    "",
    ...v.rows.map((r) => `${r.label}: ${r.value}`),
    "",
    `*${v.verdictText}*`,
    v.verdictSub,
  ];
  if (v.source)
    lines.push(
      `Mulai ${v.startText} · Selesai ${v.running ? "masih berjalan" : v.endText}${v.source === "timer" ? ` · Jeda ${durationText(v.pausedMs / 60_000)}` : ""}`,
    );
  if (v.schedule)
    lines.push(
      `Jadwal ${v.schedule.planned}${v.schedule.actual ? ` · Nyata ${v.schedule.actual}` : ""}`,
      ...(v.schedule.note ? [v.schedule.note] : []),
    );
  lines.push(
    "",
    ...v.stats.map((s) => `${s.label}: ${s.value}${s.note ? ` (${s.note})` : ""}`),
    "",
    `Dibuat ${v.generated} · Tetra Booth`,
  );
  return lines.join("\n");
}
