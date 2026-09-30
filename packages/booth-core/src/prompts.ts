import type { SoundCue } from "@tetra/shared";

/**
 * Kalimat & suara di sela foto (DECISIONS #103), supaya sesi tidak monoton "cekrek" saja.
 * Suara diputar dari `sounds/<cue>.wav` (paket suara di renderer booth); file tidak ada = diam / bunyi tik bawaan.
 * Suara kalimat hanya untuk kalimat bawaan (ucapan = tulisan); kalimat buatan event tampil tanpa suara.
 */
export type Cue = SoundCue;

const isLast = (i: number, total: number) => total > 1 && i === total - 1;

/** Suara sebelum foto ke-i (0-based): foto-1..3, foto terakhir selalu "foto-terakhir". */
export const beforeCue = (i: number, total: number): Cue =>
  isLast(i, total) ? "foto-terakhir" : (`foto-${Math.min(i + 1, 3)}` as Cue);

/** Kalimat sebelum foto: urut dari daftar, foto terakhir memakai kalimat terakhir. */
export function beforeText(i: number, total: number, list: readonly string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  return list[isLast(i, total) ? list.length - 1 : Math.min(i, list.length - 2)] ?? "";
}

/** Sorakan setelah foto: acak dari daftar (`rnd` 0..1). `voiced` = daftar bawaan → suara keren-<n> sama dengan tulisannya. */
export function after(
  list: readonly string[],
  rnd: number,
  voiced: boolean,
): { text: string; cue: Cue | null } {
  const n = Math.floor(rnd * list.length);
  return { text: list[n] ?? "", cue: voiced && n < 4 ? (`keren-${n + 1}` as Cue) : null };
}

let current: HTMLAudioElement | null = null;
/** Hentikan suara yang sedang diputar (fade pendek) dan selesaikan promise `play`-nya. */
let supersede: (() => void) | null = null;
/** Pengaturan suara event aktif (#104): "off" = diam, selain itu URL file pengganti. */
let overrides: Partial<Record<Cue, string>> = {};
export const setSoundOverrides = (o: Partial<Record<Cue, string>> | undefined) => {
  overrides = o ?? {};
};

/** Kecilkan suara yang sedang diputar sampai diam dalam `ms`, lalu berhenti (bumper dilewati). */
export function fadeOutSound(ms = 400) {
  const a = current;
  if (!a) return;
  const step = a.volume / (ms / 30);
  const t = setInterval(() => {
    a.volume = Math.max(0, a.volume - step);
    if (a.volume === 0) {
      clearInterval(t);
      a.pause();
    }
  }, 30);
}

/**
 * Seperti `play`, tapi menunggu suara yang sedang diputar selesai dulu (maks. `waitMs`), supaya sorakan tidak
 * memotong bunyi jepret (webcam: preview muncul ±0,3 dtk setelah jepret). Kalau sementara itu suara lain sudah
 * mulai (fase berganti), cue ini dilewati.
 */
export function playAfter(cue: Cue, waitMs = 600): Promise<boolean> {
  const a = current;
  if (!a || a.paused || a.ended) return play(cue);
  return new Promise((resolve) => {
    const go = () => {
      clearTimeout(t);
      a.removeEventListener("ended", go);
      resolve(current === a ? play(cue) : true);
    };
    const t = setTimeout(go, waitMs);
    a.addEventListener("ended", go, { once: true });
  });
}

/**
 * Putar satu cue; selesai saat audio habis (maks. `maxMs`). false = file tidak ada / audio gagal
 * (pemanggil boleh memakai bunyi tik). Cue yang dimatikan event = true tanpa bunyi.
 * `maxMs` hanya pengaman audio macet: 4 dtk memotong "selesai" (4,46 s) & "bayar" (4,18 s) di booth (W-034, Rama).
 */
export function play(cue: Cue, maxMs = 8000): Promise<boolean> {
  const src = overrides[cue];
  if (src === "off") return Promise.resolve(true);
  return new Promise((resolve) => {
    let a: HTMLAudioElement;
    try {
      a = new Audio(src ?? `sounds/${cue}.wav`);
      // Satu suara pada satu waktu: suara baru menggantikan yang sebelumnya, dengan fade 150 ms (bukan potong
      // mendadak, W-034) dan promise suara lama langsung selesai (pemanggilnya tidak menunggu sampai maxMs).
      supersede?.();
      current = a;
    } catch {
      resolve(false);
      return;
    }
    const done = (ok: boolean) => {
      clearTimeout(t);
      a.onended = a.onerror = null;
      if (supersede === stop) supersede = null;
      resolve(ok);
    };
    const stop = () => {
      fadeOutSound(150);
      done(true);
    };
    supersede = stop;
    const t = setTimeout(() => {
      a.pause();
      done(true);
    }, maxMs);
    a.onended = () => done(true);
    a.onerror = () => done(false);
    a.play().catch(() => done(false));
  });
}
