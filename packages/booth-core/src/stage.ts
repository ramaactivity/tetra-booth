import { type LayoutSpec, STAGE_MAX_SHOTS } from "@tetra/shared";

/**
 * Photo Stage (#178, docs/PLAN-PHOTO-STAGE.md): pengelompokan jepretan fotografer menjadi rombongan (= satu sesi).
 * Reducer murni: rombongan baru lewat tombol (Enter), jeda otomatis (bisa dimatikan), atau batas foto. Saat Jeda,
 * jepretan ditampung "belum dikelompokkan" sampai operator memasukkannya ke rombongan.
 */
export type StageShot = { path: string; width: number; height: number; at: number };
export type StageGroup = {
  /** ID sesi (dibuat runner, sama dengan sesi booth). */
  id: string;
  no: number;
  name: string | null;
  startedAt: number;
  shots: StageShot[];
  /** null = rombongan aktif. */
  closedAt: number | null;
};
export type StageState = {
  groups: StageGroup[];
  nextNo: number;
  paused: boolean;
  loose: StageShot[];
  lastShotAt: number | null;
  /** Jeda pemisah otomatis (detik); null = mati. */
  gapSec: number | null;
};
export type StageAction =
  /** `id` = ID sesi kalau jepretan ini membuka rombongan baru. */
  | { type: "SHOT"; shot: StageShot; id: string }
  | { type: "NEW_GROUP"; id: string; now: number }
  | { type: "TICK"; now: number }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "RENAME"; id: string; name: string }
  | { type: "ASSIGN_LOOSE"; id: string; now: number }
  | { type: "SET_GAP"; gapSec: number | null };

export const initialStage = (gapSec: number | null, nextNo = 1): StageState => ({
  groups: [],
  nextNo,
  paused: false,
  loose: [],
  lastShotAt: null,
  gapSec,
});

export const activeGroup = (s: StageState) => {
  const g = s.groups.at(-1);
  return g && g.closedAt === null ? g : null;
};

/** Tutup rombongan aktif; yang kosong dibuang (tidak pernah jadi sesi). */
const closeActive = (s: StageState, at: number): StageState => {
  const a = activeGroup(s);
  if (!a) return s;
  const groups = s.groups.slice(0, -1);
  return { ...s, groups: a.shots.length ? [...groups, { ...a, closedAt: at }] : groups };
};

const open = (s: StageState, id: string, at: number): StageState => ({
  ...s,
  groups: [...s.groups, { id, no: s.nextNo, name: null, startedAt: at, shots: [], closedAt: null }],
  nextNo: s.nextNo + 1,
});

const addShots = (s: StageState, shots: StageShot[]): StageState => {
  const a = activeGroup(s);
  if (!a) return s;
  return { ...s, groups: [...s.groups.slice(0, -1), { ...a, shots: [...a.shots, ...shots] }] };
};

export function stageReducer(s: StageState, a: StageAction): StageState {
  switch (a.type) {
    case "SHOT": {
      if (s.paused) return { ...s, loose: [...s.loose, a.shot] };
      const cur = activeGroup(s);
      const gapOver =
        s.gapSec !== null && s.lastShotAt !== null && a.shot.at - s.lastShotAt > s.gapSec * 1000;
      const needNew =
        !cur || (cur.shots.length > 0 && (gapOver || cur.shots.length >= STAGE_MAX_SHOTS));
      const next = needNew ? open(closeActive(s, s.lastShotAt ?? a.shot.at), a.id, a.shot.at) : s;
      return { ...addShots(next, [a.shot]), lastShotAt: a.shot.at };
    }
    case "NEW_GROUP": {
      const cur = activeGroup(s);
      if (cur && !cur.shots.length) return s;
      return open(closeActive(s, a.now), a.id, a.now);
    }
    case "TICK": {
      const cur = activeGroup(s);
      if (!cur?.shots.length || s.gapSec === null || s.lastShotAt === null) return s;
      return a.now - s.lastShotAt > s.gapSec * 1000 ? closeActive(s, a.now) : s;
    }
    case "PAUSE":
      return s.paused ? s : { ...s, paused: true };
    case "RESUME":
      return s.paused ? { ...s, paused: false } : s;
    case "RENAME": {
      const name = a.name.trim().slice(0, 120) || null;
      return {
        ...s,
        groups: s.groups.map((g) => (g.id === a.id ? { ...g, name } : g)),
      };
    }
    case "ASSIGN_LOOSE": {
      if (!s.loose.length) return s;
      const cur = activeGroup(s);
      const base = cur ? s : open(s, a.id, a.now);
      return { ...addShots(base, s.loose), loose: [], lastShotAt: a.now };
    }
    case "SET_GAP":
      return { ...s, gapSec: a.gapSec };
  }
}

/** Label rombongan tanpa nama: "Tamu · 19.42" (jam mulai, WIB laptop). */
export const groupLabel = (g: StageGroup) =>
  g.name ??
  `Tamu · ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(g.startedAt)}`;

/** Keadaan yang dikirim layar operator ke jendela TV (#179). Foto = path file kamera di laptop. */
export type StageTvState = {
  eventName: string;
  guestBaseUrl: string;
  /** CSS filter preset warna (pratinjau = hasil). */
  filter: string;
  /** Rombongan terbaru yang punya foto; `at` = jepretan terakhirnya. */
  active: { id: string; no: number; label: string; shots: string[]; at: number } | null;
  /** Dua rombongan sebelumnya (tamu yang turunnya lambat). */
  previous: { id: string; no: number; label: string }[];
  /** Foto terbaru acara untuk galeri berjalan saat idle. */
  recent: string[];
  /** Lama tampilan aktif setelah jepretan terakhir (detik). */
  activeSec: number;
  /** LUT `.cube` aktif (#184): kunci localStorage + waktu simpan; jendela TV membacanya sendiri. */
  lut: { key: string; at: number } | null;
};

/** Ringkasan untuk TV dari keadaan rombongan. */
export function tvState(
  s: StageState,
  base: Pick<StageTvState, "eventName" | "guestBaseUrl" | "filter" | "activeSec" | "lut">,
): StageTvState {
  const withShots = s.groups.filter((g) => g.shots.length);
  const a = withShots.at(-1);
  return {
    ...base,
    active: a
      ? {
          id: a.id,
          no: a.no,
          label: groupLabel(a),
          shots: a.shots.map((x) => x.path),
          at: a.shots.at(-1)?.at ?? a.startedAt,
        }
      : null,
    previous: withShots
      .slice(-3, -1)
      .reverse()
      .map((g) => ({ id: g.id, no: g.no, label: groupLabel(g) })),
    recent: withShots.flatMap((g) => g.shots.map((x) => x.path)).slice(-30),
  };
}

/**
 * Cetak instan stage (#183): desain event dipakai kalau 4R satu slot (frame klien); selain itu foto penuh 4R
 * mengikuti arah foto (lembar landscape diputar saat dicetak).
 */
export function stagePrintLayout(
  layout: LayoutSpec,
  photo: { width: number; height: number },
): LayoutSpec {
  if (layout.paper === "4R" && layout.slots.length === 1) return layout;
  const [width, height] = photo.width > photo.height ? [1800, 1200] : [1200, 1800];
  return {
    id: "stage-print",
    version: 1,
    paper: "4R",
    canvas: { width, height, dpi: 300 },
    background: { color: "#ffffff" },
    slots: [{ id: "photo", x: 0, y: 0, w: width, h: height, fit: "cover", z: "below_overlay" }],
    texts: [],
  };
}
