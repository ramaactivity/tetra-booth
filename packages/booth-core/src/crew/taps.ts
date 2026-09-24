/** Deteksi "tap N kali dalam X ms" untuk membuka mode crew (FSD §1.3: 5x dalam 3 detik). */
export function createTapDetector(count = 5, windowMs = 3000) {
  let taps: number[] = [];
  return (now: number): boolean => {
    taps = [...taps.filter((t) => now - t < windowMs), now];
    if (taps.length < count) return false;
    taps = [];
    return true;
  };
}
