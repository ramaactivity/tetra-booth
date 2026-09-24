"use client";
import { simulatePay } from "./actions";

/** Mode test Xendit: bayar tagihan tanpa dompet digital. */
export function SimulateButton({ id }: { id: string }) {
  return (
    <button
      type="button"
      className="ml-2 text-xs font-bold underline"
      onClick={() => simulatePay(id)}
    >
      Simulasikan bayar
    </button>
  );
}
