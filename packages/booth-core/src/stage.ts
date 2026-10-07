import { type LayoutSpec, STAGE_MAX_SHOTS } from "@tetra/shared";

/** Mosaik TV dipakai juga layar galeri web `/stage/{link}` (#204), jadi tinggal di `@tetra/shared`. */
export { tvMosaic } from "@tetra/shared";

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
  /** Riwayat (#195): idx foto (1 = foto pertama) yang disembunyikan dari tamu & galeri. */
  hidden?: number[];
  /** Hasil Pisah: "b", "c", … di belakang nomor (#46b). */
  part?: string;
  /** Sudah digabung ke rombongan lain: tidak tampil di riwayat. */
  merged?: boolean;
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
  /** Baki jeda (#186): foto tertampung jadi rombongan baru (yang aktif ditutup dulu), atau dibuang dari layar. */
  | { type: "LOOSE_TO_NEW"; id: string; now: number }
  | { type: "DROP_LOOSE" }
  /** Riwayat (#195): sembunyikan / tampilkan lagi foto (idx 1-based). */
  | { type: "HIDE"; id: string; idx: number[]; hidden: boolean }
  /** Foto terpilih jadi rombongan baru (sudah ditutup → diproses); di rombongan asal disembunyikan. */
  | { type: "SPLIT"; id: string; idx: number[]; newId: string; now: number }
  /** Foto yang tampil di `id` dipindah ke rombongan lama `into`; `id` ditandai digabung. */
  | { type: "MERGE"; id: string; into: string }
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
    case "LOOSE_TO_NEW": {
      if (!s.loose.length) return s;
      const base = open(closeActive(s, a.now), a.id, a.now);
      return { ...addShots(base, s.loose), loose: [], lastShotAt: a.now };
    }
    case "DROP_LOOSE":
      return { ...s, loose: [] };
    case "HIDE":
      return {
        ...s,
        groups: s.groups.map((g) => {
          if (g.id !== a.id) return g;
          const h = new Set(g.hidden ?? []);
          for (const i of a.idx) a.hidden ? h.add(i) : h.delete(i);
          return { ...g, hidden: [...h].sort((x, y) => x - y) };
        }),
      };
    case "SPLIT": {
      const src = s.groups.find((g) => g.id === a.id);
      if (!src || src.closedAt === null) return s;
      const pick = new Set(a.idx);
      const shots = src.shots.filter((_, i) => pick.has(i + 1));
      const left = src.shots.filter((_, i) => !pick.has(i + 1) && !src.hidden?.includes(i + 1));
      if (!shots.length || !left.length) return s;
      const parts = s.groups.filter((g) => g.no === src.no && g.part).length;
      const part = String.fromCharCode(98 + parts);
      const nb: StageGroup = {
        id: a.newId,
        no: src.no,
        part,
        name: null,
        startedAt: src.startedAt,
        shots,
        closedAt: a.now,
      };
      const at = s.groups.indexOf(src) + 1;
      const groups = s.groups.map((g) =>
        g === src
          ? { ...g, hidden: [...new Set([...(g.hidden ?? []), ...a.idx])].sort((x, y) => x - y) }
          : g,
      );
      return { ...s, groups: [...groups.slice(0, at), nb, ...groups.slice(at)] };
    }
    case "MERGE": {
      const src = s.groups.find((g) => g.id === a.id);
      const dst = s.groups.find((g) => g.id === a.into);
      if (!src || !dst || src.closedAt === null || dst.closedAt === null) return s;
      const moved = src.shots.filter((_, i) => !src.hidden?.includes(i + 1));
      return {
        ...s,
        groups: s.groups.map((g) =>
          g === dst
            ? { ...g, shots: [...g.shots, ...moved] }
            : g === src
              ? { ...g, merged: true, hidden: src.shots.map((_, i) => i + 1) }
              : g,
        ),
      };
    }
    case "SET_GAP":
      return { ...s, gapSec: a.gapSec };
  }
}

const hm = (ms: number) =>
  new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(ms);
/** Label rombongan tanpa nama: "Tamu · 19.42" (jam mulai, WIB laptop). */
export const groupLabel = (g: StageGroup) => g.name ?? `Tamu · ${hm(g.startedAt)}`;
/** Nomor tampil: "#46", hasil Pisah "#46b". */
export const groupNo = (g: StageGroup) => `${g.no}${g.part ?? ""}`;

/** Keadaan yang dikirim layar operator ke jendela TV (#179). Foto = path file kamera di laptop. */
export type StageTvState = {
  eventName: string;
  /** Label kecil di atas nama event, mis. "The Wedding of". */
  tagline?: string | undefined;
  date?: string | undefined;
  /** QR galeri acara di layar idle (#189); null = tidak ditampilkan. */
  galleryUrl?: string | null;
  guestBaseUrl: string;
  /** CSS filter preset warna (pratinjau = hasil). */
  filter: string;
  /** Rombongan terbaru yang punya foto; `at` = jepretan terakhirnya. */
  active: {
    id: string;
    no: number;
    label: string;
    time: string;
    shots: string[];
    at: number;
  } | null;
  /** Dua rombongan sebelumnya (tamu yang turunnya lambat). */
  previous: { id: string; no: number; label: string }[];
  /** Foto terbaru acara untuk galeri berjalan saat idle (satu per rombongan). */
  recent: { path: string; label: string; time: string }[];
  /** "Cari fotomu" di TV sentuh (#200): rombongan terbaru dulu (maks. 60), foto yang tampil saja. */
  groups?: { id: string; no: string; label: string; time: string; shots: string[] }[];
  /** Lama tampilan aktif setelah jepretan terakhir (detik). */
  activeSec: number;
  /** Layar uji dari wizard persiapan (#188). */
  test?: boolean;
  /** LUT `.cube` aktif (#184): kunci localStorage + waktu simpan; jendela TV membacanya sendiri. */
  lut: { key: string; at: number } | null;
};

/** Ringkasan untuk TV dari keadaan rombongan. */
export function tvState(
  s: StageState,
  base: Omit<StageTvState, "active" | "previous" | "recent" | "groups">,
): StageTvState {
  // Rombongan yang digabung & foto yang disembunyikan (#195) tidak tampil di TV.
  const shown = (g: StageGroup) => g.shots.filter((_, i) => !g.hidden?.includes(i + 1));
  const withShots = s.groups
    .filter((g) => !g.merged)
    .map((g) => ({ ...g, shots: shown(g) }))
    .filter((g) => g.shots.length);
  const a = withShots.at(-1);
  return {
    ...base,
    active: a
      ? {
          id: a.id,
          no: a.no,
          label: groupLabel(a),
          time: hm(a.startedAt),
          shots: a.shots.map((x) => x.path),
          at: a.shots.at(-1)?.at ?? a.startedAt,
        }
      : null,
    previous: withShots
      .slice(-3, -1)
      .reverse()
      .map((g) => ({ id: g.id, no: g.no, label: groupLabel(g) })),
    recent: withShots
      .slice(-12)
      .map((g) => ({ path: g.shots[0]?.path ?? "", label: groupLabel(g), time: hm(g.startedAt) })),
    groups: withShots
      .slice(-60)
      .reverse()
      .map((g) => ({
        id: g.id,
        no: groupNo(g),
        label: groupLabel(g),
        time: hm(g.startedAt),
        shots: g.shots.map((x) => x.path),
      })),
  };
}

/** Aset overlay lengkung putih frame "Lengkung" (#194), digambar booth saat cetak. */
export const STAGE_ARCH = "stage-arch";
/** Font frame "Lengkung": Cormorant Garamond (fontsource di aplikasi booth). */
export const STAGE_SERIF = "stage-serif";
const MONTHS = [
  "januari",
  "februari",
  "maret",
  "april",
  "mei",
  "juni",
  "juli",
  "agustus",
  "september",
  "oktober",
  "november",
  "desember",
];
/** "12 Desember 2026" → "12 · 12 · 2026"; format lain apa adanya. */
export const dotDate = (d: string) => {
  const m = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i.exec(d.trim());
  const mo = m ? MONTHS.indexOf((m[2] ?? "").toLowerCase()) : -1;
  return m && mo >= 0 ? `${m[1]} · ${mo + 1} · ${m[3]}` : d;
};

/**
 * Frame cetak 4R bawaan "Lengkung" (#194, desain docs/design/photo-stage Frame 4R): foto inset 44/44/44/150,
 * lengkung putih di tengah bawah (lebar mengikuti panjang nama), tagline + nama + tanggal serif.
 */
export function stageArchLayout(e: {
  name: string;
  tagline?: string | undefined;
  date: string;
}): LayoutSpec {
  const w = Math.min(1300, Math.max(820, 520 + e.name.replace(/\s*&\s*/g, "").length * 52));
  const x = (1800 - w) / 2;
  const text = (y: number, size: number, color: string, value: string) => ({
    x,
    y,
    w,
    fontAssetId: STAGE_SERIF,
    size,
    color,
    align: "center" as const,
    value,
  });
  return {
    id: "stage-lengkung",
    version: 1,
    paper: "4R",
    canvas: { width: 1800, height: 1200, dpi: 300 },
    background: { color: "#ffffff" },
    slots: [{ id: "photo", x: 44, y: 44, w: 1712, h: 1006, fit: "cover", z: "below_overlay" }],
    overlay: { assetId: STAGE_ARCH, x, y: 900, w, h: 300 },
    texts: [
      ...(e.tagline ? [text(966, 36, "#6b6862", e.tagline)] : []),
      text(1012, 96, "#2a2926", e.name),
      text(1120, 28, "#2a2926", dotDate(e.date)),
    ],
  };
}

/**
 * Cetak instan stage (#183, #194): frame 4R event dipakai kalau 4R satu slot (frame klien); foto landscape tanpa
 * frame event = frame bawaan "Lengkung"; foto portrait = foto penuh 4R.
 */
export function stagePrintLayout(
  e: { layout: LayoutSpec; name: string; tagline?: string | undefined; date: string },
  photo: { width: number; height: number },
): LayoutSpec {
  if (e.layout.paper === "4R" && e.layout.slots.length === 1) return e.layout;
  if (photo.width > photo.height) return stageArchLayout(e);
  return {
    id: "stage-print",
    version: 1,
    paper: "4R",
    canvas: { width: 1200, height: 1800, dpi: 300 },
    background: { color: "#ffffff" },
    slots: [{ id: "photo", x: 0, y: 0, w: 1200, h: 1800, fit: "cover", z: "below_overlay" }],
    texts: [],
  };
}
