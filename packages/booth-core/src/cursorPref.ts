/**
 * Kursor mouse di mode tamu (kiosk): default tersembunyi; crew bisa menampilkannya supaya mudah bekerja dengan
 * mouse (masukan Rama). Disimpan per laptop di localStorage renderer; gagal baca/tulis = default.
 */
const KEY = "tb.guestCursor";

export const guestCursor = {
  shown: (): boolean => {
    try {
      return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  },
  set: (on: boolean) => {
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch {
      // diblokir: abaikan
    }
  },
};
