/**
 * Bunyi hitung mundur (DECISIONS #102): nada pendek dari Web Audio, tanpa file suara.
 * `tick` tiap detik, `shutter` saat hitungan habis. Gagal (tanpa perangkat audio) = diam.
 */
import { boothSound } from "./cursorPref";

let ctx: AudioContext | null = null;

export function beep(kind: "tick" | "shutter") {
  if (!boothSound.on()) return;
  try {
    ctx ??= new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const len = kind === "tick" ? 0.12 : 0.25;
    o.frequency.value = kind === "tick" ? 880 : 1320;
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + len);
  } catch {
    // Tanpa audio: hitung mundur tetap jalan.
  }
}
