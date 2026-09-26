/**
 * State machine sesi booth: mode event (FSD §1.4, §1.7–1.11) dan photobox (§1.5, §1.12, DECISIONS #70:
 * pilih layout → bayar paket → foto dengan timer → tambahan cetak dibayar setelah foto).
 * Reducer murni: semua timer & efek samping ada di SessionRunner, bukan di sini.
 */

export { DEFAULT_SETTINGS, type EventSettings } from "@tetra/shared";

/** Capture gagal berturut-turut sebanyak ini → layar "kamera disiapkan". FSD §1.7: retry otomatis 1x. */
export const MAX_CAPTURE_ATTEMPTS = 2;

/** `sharp` = skor ketajaman preview (DECISIONS #88), hanya untuk pengingat foto buram. */
export type Photo = { path: string; url: string; width: number; height: number; sharp?: number };
/** `path` = lembar cetak 1200×1800, `piecePath`/`url` = satu potong desain (DECISIONS #78). */
export type Strip = { path: string; piecePath: string; url: string };

export type Phase =
  | "attract"
  | "layout_select"
  | "payment"
  | "paid"
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
  /** Photobox: alur bayar aktif untuk sesi ini. */
  photobox: boolean;
  /** Photobox: ID sesi sudah dibuat saat memilih layout (dipakai tagihan), jadi `sessionId` setelah lunas. */
  draftId: string | null;
  layoutId: string | null;
  /** Tagihan yang sedang ditampilkan: paket, atau tambahan cetak sejumlah `extraPrints`. */
  paying: { for: "package" } | { for: "extra"; extraPrints: number } | null;
  paymentId: string | null;
  /** Photobox: batas waktu sesi (epoch ms) sejak paket lunas; null = tanpa timer. */
  deadline: number | null;
};

export type SessionEvent =
  | {
      type: "START";
      sessionId: string;
      slots: number;
      retakeMax: number;
      deadline?: number;
      /** Mode event multi desain: desain pilihan tamu. */
      layoutId?: string;
    }
  | { type: "PHOTOBOX_START"; draftId: string }
  /** Mode event dengan beberapa desain (DECISIONS #99): tamu memilih desain dulu, tanpa bayar. */
  | { type: "CHOOSE_DESIGN" }
  | { type: "LAYOUT_CHOSEN"; layoutId: string }
  | { type: "BACK" }
  | { type: "PAID"; paymentId: string }
  | { type: "PAYMENT_CANCEL" }
  | { type: "TIME_UP" }
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
  photobox: false,
  draftId: null,
  layoutId: null,
  paying: null,
  paymentId: null,
  deadline: null,
};

/** Waktu habis: slot kosong diisi foto terakhir yang ada (FSD §1.5). */
const fillPhotos = (photos: (Photo | null)[]) => {
  const last = photos.findLast((p) => p !== null) ?? null;
  return last ? photos.map((p) => p ?? last) : photos;
};

export const canRetake = (s: SessionState, index: number): boolean =>
  (s.retakesUsed[index] ?? 0) < s.retakeMax;

export function sessionReducer(s: SessionState, e: SessionEvent): SessionState {
  switch (e.type) {
    case "START": {
      // Mode event dari attract atau dari pilih desain; photobox setelah paket lunas (layar "paid").
      const fromPicker = s.phase === "layout_select" && !s.photobox;
      if ((s.phase !== "attract" && s.phase !== "paid" && !fromPicker) || e.slots < 1) return s;
      return {
        ...(s.phase === "paid" ? s : initialSession),
        ...(e.layoutId && { layoutId: e.layoutId }),
        phase: "countdown",
        sessionId: e.sessionId,
        slots: e.slots,
        retakeMax: e.retakeMax,
        photos: Array(e.slots).fill(null),
        retakesUsed: Array(e.slots).fill(0),
        deadline: e.deadline ?? null,
      };
    }
    case "CHOOSE_DESIGN":
      return s.phase === "attract" ? { ...initialSession, phase: "layout_select" } : s;
    case "PHOTOBOX_START":
      return s.phase === "attract"
        ? { ...initialSession, phase: "layout_select", photobox: true, draftId: e.draftId }
        : s;
    case "LAYOUT_CHOSEN":
      return s.phase === "layout_select"
        ? { ...s, phase: "payment", layoutId: e.layoutId, paying: { for: "package" } }
        : s;
    case "BACK":
      return s.phase === "layout_select" ? initialSession : s;
    case "PAID":
      if (s.phase !== "payment" || !s.paying) return s;
      return s.paying.for === "package"
        ? { ...s, phase: "paid", paymentId: e.paymentId, paying: null }
        : { ...s, phase: "printing", prints: 1 + s.paying.extraPrints, paying: null };
    case "PAYMENT_CANCEL":
      if (s.phase !== "payment" || !s.paying) return s;
      // Batal paket → pilih layout lagi; batal tambahan → cetak 1 lembar yang sudah termasuk paket.
      return s.paying.for === "package"
        ? { ...s, phase: "layout_select", layoutId: null, paying: null }
        : { ...s, phase: "printing", prints: 1, paying: null };
    case "TIME_UP":
      switch (s.phase) {
        case "countdown":
        case "capture":
        case "preview":
        case "camera_error":
        case "review":
          return { ...s, phase: "compose", photos: fillPhotos(s.photos), retaking: false };
        case "print_select":
          // Photobox (satu-satunya pemakai timer): lembar paket sudah dibayar → tetap dicetak 1 (DECISIONS #84).
          return { ...s, phase: "printing", prints: 1 };
        default:
          // Pembayaran tambahan yang sedang berjalan tidak dipotong timer.
          return s;
      }
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
      if (s.phase !== "print_select" || e.count < 0) return s;
      // 0 = "Tidak Cetak": lewati cetak, langsung QR.
      if (e.count === 0) return { ...s, phase: "qr", prints: 0 };
      // Photobox: lembar ke-2 dst. dibayar dulu (A7b "Bayar & Cetak").
      return s.photobox && e.count > 1
        ? { ...s, phase: "payment", paying: { for: "extra", extraPrints: e.count - 1 } }
        : { ...s, phase: "printing", prints: e.count };
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
