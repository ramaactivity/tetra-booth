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

/**
 * Suara booth (permintaan Rama 9 Okt): suara pemandu, sorakan, dan bunyi tik/jepret hitung mundur. Bawaan nyala;
 * crew bisa mematikan per laptop (mis. acara formal / ruang ibadah). Disimpan seperti kursor.
 */
const SOUND_KEY = "tb.sound";
export const boothSound = {
  on: (): boolean => {
    try {
      return typeof localStorage === "undefined" || localStorage.getItem(SOUND_KEY) !== "0";
    } catch {
      return true;
    }
  },
  set: (on: boolean) => {
    try {
      localStorage.setItem(SOUND_KEY, on ? "1" : "0");
    } catch {
      // diblokir: abaikan
    }
  },
};
