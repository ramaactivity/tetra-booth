/**
 * State machine sesi booth mode event. FSD §1.4, §1.7–1.11.
 * Reducer murni: semua timer & efek samping ada di SessionRunner, bukan di sini.
 */

export { DEFAULT_SETTINGS, type EventSettings } from "@tetra/shared";

/** Capture gagal berturut-turut sebanyak ini → layar "kamera disiapkan". FSD §1.7: retry otomatis 1x. */
export const MAX_CAPTURE_ATTEMPTS = 2;

export type Photo = { path: string; url: string; width: number; height: number };
export type Strip = { path: string; url: string };

export type Phase =
  | "attract"
  | "countdown"
  | "capture"
  | "preview"
  | "camera_error"
  | "review"
  | "compose"
  | "print_select"
  | "printing"
  | "qr";

export type SessionState = {
  phase: Phase;
  sessionId: string | null;
  slots: number;
  retakeMax: number;
  /** Foto yang sedang diambil (0-based). */
  index: number;
  /** Capture ini retake dari layar review → kembali ke review. */
  retaking: boolean;
  photos: (Photo | null)[];
  retakesUsed: number[];
  /** Percobaan capture untuk `index`; juga kunci efek supaya retry memicu capture baru. */
  attempt: number;
  prints: number;
  /** Hasil cetak sesi ini: submit ditolak atau event `print.failed` → "failed" (layar A11). */
  print: "pending" | "done" | "failed";
  strip: Strip | null;
};

export type SessionEvent =
  | { type: "START"; sessionId: string; slots: number; retakeMax: number }
  | { type: "COUNTDOWN_DONE" }
  | { type: "CAPTURED"; photo: Photo }
  | { type: "CAPTURE_FAILED" }
  | { type: "CAMERA_READY" }
  | { type: "PREVIEW_DONE" }
  | { type: "RETAKE"; index: number }
  | { type: "CONTINUE" }
  | { type: "COMPOSED"; strip: Strip }
  | { type: "COMPOSE_FAILED" }
  | { type: "PRINTS_SELECTED"; count: number }
  | { type: "PRINT_DONE"; ok: boolean }
  | { type: "PRINT_RESULT"; ok: boolean }
  | { type: "FINISH" };

export const initialSession: SessionState = {
  phase: "attract",
  sessionId: null,
  slots: 0,
  retakeMax: 0,
  index: 0,
  retaking: false,
  photos: [],
  retakesUsed: [],
  attempt: 0,
  prints: 0,
  print: "pending",
  strip: null,
};

export const canRetake = (s: SessionState, index: number): boolean =>
  (s.retakesUsed[index] ?? 0) < s.retakeMax;

export function sessionReducer(s: SessionState, e: SessionEvent): SessionState {
  switch (e.type) {
    case "START":
      if (s.phase !== "attract" || e.slots < 1) return s;
      return {
        ...initialSession,
        phase: "countdown",
        sessionId: e.sessionId,
        slots: e.slots,
        retakeMax: e.retakeMax,
        photos: Array(e.slots).fill(null),
        retakesUsed: Array(e.slots).fill(0),
      };
    case "COUNTDOWN_DONE":
      return s.phase === "countdown" ? { ...s, phase: "capture", attempt: 1 } : s;
    case "CAPTURED": {
      if (s.phase !== "capture") return s;
      const photos = s.photos.with(s.index, e.photo);
      return {
        ...s,
        photos,
        attempt: 0,
        phase: s.retaking ? "review" : "preview",
        retaking: false,
      };
    }
    case "CAPTURE_FAILED":
      if (s.phase !== "capture") return s;
      return s.attempt < MAX_CAPTURE_ATTEMPTS
        ? { ...s, attempt: s.attempt + 1 }
        : { ...s, phase: "camera_error", attempt: 0 };
    case "CAMERA_READY":
      // Lanjut dari foto yang gagal (FSD §1.7).
      return s.phase === "camera_error" ? { ...s, phase: "countdown" } : s;
    case "PREVIEW_DONE": {
      if (s.phase !== "preview") return s;
      const next = s.index + 1;
      return next < s.slots ? { ...s, phase: "countdown", index: next } : { ...s, phase: "review" };
    }
    case "RETAKE":
      if (s.phase !== "review" || e.index < 0 || e.index >= s.slots || !canRetake(s, e.index)) {
        return s;
      }
      return {
        ...s,
        phase: "countdown",
        index: e.index,
        retaking: true,
        retakesUsed: s.retakesUsed.with(e.index, (s.retakesUsed[e.index] ?? 0) + 1),
      };
    case "CONTINUE":
      return s.phase === "review" ? { ...s, phase: "compose" } : s;
    case "COMPOSED":
      return s.phase === "compose" ? { ...s, phase: "print_select", strip: e.strip } : s;
    case "COMPOSE_FAILED":
      // Booth tidak boleh macet: tanpa strip, lewati cetak dan tetap tampilkan QR.
      return s.phase === "compose" ? { ...s, phase: "qr" } : s;
    case "PRINTS_SELECTED":
      return s.phase === "print_select" && e.count >= 1
        ? { ...s, phase: "printing", prints: e.count }
        : s;
    case "PRINT_DONE":
      return s.phase === "printing" ? { ...s, phase: "qr", print: e.ok ? s.print : "failed" } : s;
    case "PRINT_RESULT":
      return s.phase === "printing" || s.phase === "qr"
        ? { ...s, print: e.ok ? "done" : "failed" }
        : s;
    case "FINISH":
      return s.phase === "qr" ? initialSession : s;
  }
}
