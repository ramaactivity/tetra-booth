/**
 * Tipe state sesi booth. FSD §1.4 & §1.5. Reducer nyata dibangun di Fase 1.
 * Ditulis eksplisit sebagai state machine, bukan kumpulan useState.
 */
export type SessionState =
  | { name: "attract" }
  | { name: "pick_layout" } // photobox
  | { name: "pick_prints" } // photobox
  | { name: "pay_qris"; paymentId: string } // photobox
  | { name: "countdown"; index: number }
  | { name: "capture"; index: number }
  | { name: "review" }
  | { name: "compose" }
  | { name: "print_select" }
  | { name: "printing" }
  | { name: "qr"; sessionId: string };

export type SessionEvent =
  | { type: "TOUCH" }
  | { type: "LAYOUT_PICKED"; layoutVersionId: string }
  | { type: "PRINTS_PICKED"; count: number }
  | { type: "PAID"; paymentId: string }
  | { type: "COUNTDOWN_DONE" }
  | { type: "CAPTURED"; index: number; path: string }
  | { type: "CAPTURE_FAILED"; index: number }
  | { type: "RETAKE"; index: number }
  | { type: "CONTINUE" }
  | { type: "COMPOSED" }
  | { type: "PRINT_SUBMITTED" }
  | { type: "DONE" }
  | { type: "TIMEOUT" };
