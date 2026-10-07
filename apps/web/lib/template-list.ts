/**
 * Daftar Template (DECISIONS #160): pemakaian per template, filter, urutan, dan statistik.
 * Murni (tanpa DB) supaya bisa dites.
 */

export type TemplateRow = {
  id: string;
  name: string;
  /** `4R` | `2x6x2` | `3x4x2` */
  paper: string;
  landscape: boolean;
  /** Versi terakhir disimpan (ISO). */
  savedAt: string;
  /** Event yang memakai (desain frame event atau dijual di photobox). */
  events: number;
  /** Tanggal event terakhir yang memakai (YYYY-MM-DD). */
  lastEvent: string | null;
  /** Photobox: sesi lunas (tanpa sesi tes), lembar, sesi bulan ini, terakhir dipakai. */
  sessions: number;
  prints: number;
  sessionsMonth: number;
  lastUsed: string | null;
};

type EventRef = {
  event_date: string;
  tpl: { layoutId?: string; versions?: Record<string, number> } | null;
  pb: ({ template?: string } | Record<string, unknown>)[] | null;
};

/** layoutId → { jumlah event, tanggal event terakhir } dari settings.template & settings.photobox.layouts. */
export function eventUsage(events: EventRef[]) {
  const out = new Map<string, { events: number; last: string | null }>();
  for (const e of events) {
    const ids = new Set([
      ...Object.keys(e.tpl?.versions ?? {}),
      ...(e.tpl?.layoutId ? [e.tpl.layoutId] : []),
      ...(Array.isArray(e.pb) ? e.pb : []).flatMap((l) =>
        typeof l.template === "string" ? [l.template] : [],
      ),
    ]);
    for (const id of ids) {
      const u = out.get(id) ?? { events: 0, last: null };
      u.events++;
      if (!u.last || e.event_date > u.last) u.last = e.event_date;
      out.set(id, u);
    }
  }
  return out;
}

export const PAPERS = [
  ["2R", "2x6x2"],
  ["4R", "4R"],
  ["Polaroid", "3x4x2"],
] as const;
export type Sort = "disimpan" | "nama" | "dipakai";
export type Filters = { q: string; kertas: string; arah: string; urut: Sort };

export function filterSort<T extends TemplateRow>(rows: T[], f: Filters, photobox: boolean) {
  const q = f.q.trim().toLowerCase();
  const paper = PAPERS.find(([k]) => k === f.kertas)?.[1];
  const used = (r: TemplateRow) => (photobox ? r.sessions : r.events);
  return rows
    .filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q)) &&
        (!paper || r.paper === paper) &&
        (!f.arah || r.landscape === (f.arah === "landscape")),
    )
    .sort((a, b) =>
      f.urut === "nama"
        ? a.name.localeCompare(b.name, "id")
        : f.urut === "dipakai"
          ? used(b) - used(a) || b.savedAt.localeCompare(a.savedAt)
          : b.savedAt.localeCompare(a.savedAt),
    );
}

/** Jumlah per kertas + pemakaian untuk strip statistik. */
export function stats<T extends TemplateRow>(rows: T[], today: string) {
  const top = rows.reduce<T | null>(
    (t, r) => (r.sessionsMonth > (t?.sessionsMonth ?? 0) ? r : t),
    null,
  );
  return {
    total: rows.length,
    paper: Object.fromEntries(
      PAPERS.map(([k, p]) => [k, rows.filter((r) => r.paper === p).length]),
    ) as Record<(typeof PAPERS)[number][0], number>,
    sessionsMonth: rows.reduce((n, r) => n + r.sessionsMonth, 0),
    top,
    unused: rows.filter((r) => !r.events && !r.sessions).length,
    upcoming: rows.filter((r) => r.lastEvent && r.lastEvent >= today).length,
  };
}
