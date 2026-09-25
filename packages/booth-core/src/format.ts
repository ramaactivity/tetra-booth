/** "Rp 35.000" */
export const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
/** "Rp 35rb" untuk kartu layout (desain A2); di bawah seribu tetap penuh. */
export const rupiahShort = (n: number) =>
  n >= 1000 && n % 1000 === 0 ? `Rp ${n / 1000}rb` : rupiah(n);
/** "04:32" */
export const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
