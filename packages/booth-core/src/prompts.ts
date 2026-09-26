/**
 * Kalimat & suara di sela foto (DECISIONS #103), supaya sesi tidak monoton "cekrek" saja.
 * Suara diputar dari `sounds/<cue>.wav` (paket suara di renderer booth); file tidak ada = diam / bunyi tik bawaan.
 * Suara kalimat hanya untuk kalimat bawaan (ucapan = tulisan); kalimat buatan event tampil tanpa suara.
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
  | "keren-4"
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

/** Putar satu cue; selesai saat audio habis (maks. `maxMs`). false = file tidak ada / audio gagal. */
export function play(cue: Cue, maxMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    let a: HTMLAudioElement;
    try {
      a = new Audio(`sounds/${cue}.wav`);
      // Satu suara pada satu waktu: suara baru memotong yang sebelumnya.
      current?.pause();
      current = a;
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
