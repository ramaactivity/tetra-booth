import { cpuCanvas } from "@tetra/template-engine";

/**
 * Peringatan foto buram (DECISIONS #88), hanya pengingat, tidak pernah mengunci alur.
 * Skor = variance Laplacian luma, foto diperkecil ke 800 px, area tengah 60% (metode uji Windows W-031).
 * Skor bergantung isi adegan, jadi dibandingkan dengan patokan: Tes Jepret crew per event, atau median
 * foto-foto terakhir. Foto < 60% patokan = "mungkin buram".
 */
export const SHARP_SIDE = 800;
export const BLUR_RATIO = 0.6;
const RECENT_MAX = 24;
const MIN_RECENT = 6;

/** Variance Laplacian (kernel 4-tetangga) dari luma `w`×`h`. */
export function laplacianVariance(luma: ArrayLike<number>, w: number, h: number): number {
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v =
        4 * (luma[i] ?? 0) -
        (luma[i - 1] ?? 0) -
        (luma[i + 1] ?? 0) -
        (luma[i - w] ?? 0) -
        (luma[i + w] ?? 0);
      sum += v;
      sq += v * v;
      n++;
    }
  if (!n) return 0;
  const mean = sum / n;
  return sq / n - mean * mean;
}

/** Skor ketajaman sebuah gambar (bitmap preview atau raw). */
export function sharpness(img: ImageBitmap): number {
  const k = SHARP_SIDE / Math.max(img.width, img.height);
  const w = Math.max(1, Math.round(img.width * Math.min(1, k)));
  const h = Math.max(1, Math.round(img.height * Math.min(1, k)));
  const c = cpuCanvas(w, h);
  const g = c.getContext("2d");
  if (!g) return 0;
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, w, h);
  const cw = Math.round(w * 0.6);
  const ch = Math.round(h * 0.6);
  const { data } = g.getImageData(Math.round(w * 0.2), Math.round(h * 0.2), cw, ch);
  const luma = new Float32Array(cw * ch);
  for (let i = 0; i < luma.length; i++)
    luma[i] =
      0.299 * (data[i * 4] ?? 0) + 0.587 * (data[i * 4 + 1] ?? 0) + 0.114 * (data[i * 4 + 2] ?? 0);
  return laplacianVariance(luma, cw, ch);
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};

/** Patokan untuk event: Tes Jepret crew, atau median foto terakhir (≥ 6 foto); null = belum bisa menilai. */
export const blurReference = (baseline: number | null, recent: number[]) =>
  baseline ?? (recent.length >= MIN_RECENT ? median(recent) : null);

export const isBlurry = (score: number | undefined, ref: number | null) =>
  score !== undefined && ref !== null && score < BLUR_RATIO * ref;

/** Penyimpanan per laptop (localStorage renderer); gagal baca/tulis = fitur diam saja. */
type Store = Pick<Storage, "getItem" | "setItem">;
const read = <T>(s: Store, k: string, fallback: T): T => {
  try {
    const v = s.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (s: Store, k: string, v: unknown) => {
  try {
    s.setItem(k, JSON.stringify(v));
  } catch {
    // penuh / diblokir: abaikan
  }
};

export function sharpStore(s: Store) {
  const recent = () => read<number[]>(s, "tb.sharp.recent", []);
  const sessions = () => read<boolean[]>(s, "tb.sharp.sessions", []);
  return {
    baseline: (eventId: string) => read<number | null>(s, `tb.sharp.base.${eventId}`, null),
    setBaseline: (eventId: string, score: number) => write(s, `tb.sharp.base.${eventId}`, score),
    reference: (eventId: string) =>
      blurReference(read<number | null>(s, `tb.sharp.base.${eventId}`, null), recent()),
    /** Catat skor foto satu sesi + apakah sesi itu punya foto mungkin buram. */
    recordSession: (scores: number[], blurry: boolean) => {
      write(s, "tb.sharp.recent", [...recent(), ...scores].slice(-RECENT_MAX));
      write(s, "tb.sharp.sessions", [...sessions(), blurry].slice(-3));
    },
    /** ≥ 2 dari 3 sesi terakhir mungkin buram → ingatkan crew. */
    crewWarning: () => sessions().filter(Boolean).length >= 2,
    dismissWarning: () => write(s, "tb.sharp.sessions", []),
  };
}

/** Penyimpanan bersama renderer booth (localStorage; tanpa window = memori saja, mis. test). */
const memory = new Map<string, string>();
export const sharpNotes = sharpStore(
  typeof localStorage === "undefined"
    ? { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) }
    : localStorage,
);
