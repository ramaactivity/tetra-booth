/**
 * Kalimat & suara di sela foto (DECISIONS #103), supaya sesi tidak monoton "cekrek" saja.
 * Suara diputar dari `sounds/<cue>.mp3` (paket suara di renderer booth); file tidak ada = diam / bunyi tik bawaan.
 */
export type Cue =
  | "mulai"
  | "foto-1"
  | "foto-2"
  | "foto-3"
  | "foto-terakhir"
  | "3"
  | "2"
  | "1"
  | "jepret"
  | "keren-1"
  | "keren-2"
  | "keren-3"
  | "review"
  | "cetak"
  | "selesai"
  | "bayar";

const isLast = (i: number, total: number) => total > 1 && i === total - 1;

/** Suara sebelum foto ke-i (0-based): foto-1..3, foto terakhir selalu "foto-terakhir". */
export const beforeCue = (i: number, total: number): Cue =>
  isLast(i, total) ? "foto-terakhir" : (`foto-${Math.min(i + 1, 3)}` as Cue);

/** Kalimat sebelum foto: urut dari daftar, foto terakhir memakai kalimat terakhir. */
export function beforeText(i: number, total: number, list: readonly string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  return list[isLast(i, total) ? list.length - 1 : Math.min(i, list.length - 2)] ?? "";
}

/** Sorakan setelah foto: acak dari daftar (`rnd` 0..1), suaranya keren-1..3. */
export function after(list: readonly string[], rnd: number): { text: string; cue: Cue } {
  const n = Math.floor(rnd * 3);
  return {
    text: list[Math.floor(rnd * list.length)] ?? "",
    cue: `keren-${n + 1}` as Cue,
  };
}

/** Putar satu cue; selesai saat audio habis (maks. `maxMs`). false = file tidak ada / audio gagal. */
export function play(cue: Cue, maxMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    let a: HTMLAudioElement;
    try {
      a = new Audio(`sounds/${cue}.mp3`);
    } catch {
      resolve(false);
      return;
    }
    const done = (ok: boolean) => {
      clearTimeout(t);
      a.onended = a.onerror = null;
      resolve(ok);
    };
    const t = setTimeout(() => {
      a.pause();
      done(true);
    }, maxMs);
    a.onended = () => done(true);
    a.onerror = () => done(false);
    a.play().catch(() => done(false));
  });
}
