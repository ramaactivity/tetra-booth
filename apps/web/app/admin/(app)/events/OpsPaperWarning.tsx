import { type LayoutPaper, paperLabel } from "@tetra/shared";
import { TriangleAlert } from "lucide-react";

/** Ukuran frame Tetra Ops → kertas booth ('none' / tidak dikenal = tidak diubah). */
export const OPS_PAPER: Record<string, LayoutPaper> = {
  "2R": "2x6x2",
  "4R": "4R",
  polaroid: "3x4x2",
};
const TITLE: Record<LayoutPaper, string> = {
  "2x6x2": "Strip 2R",
  "4R": "Foto 4R",
  "3x4x2": "Polaroid",
};
const OPS_NAME: Record<LayoutPaper, string> = { "2x6x2": "2R", "4R": "4R", "3x4x2": "polaroid" };

/**
 * Kertas beda dari ukuran frame booking Tetra Ops (#162): peringatan, tidak memblokir.
 * Wizard Buat event & Pengaturan (`events.ops_frame_size`).
 */
export function OpsPaperWarning({ ops, paper }: { ops: LayoutPaper; paper: LayoutPaper }) {
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-xl border-[1.5px] border-ink bg-peach px-3.5 py-2.5 text-[13px] leading-normal md:col-span-2"
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-4 flex-none" strokeWidth={2.25} />
      <span>
        Tetra Ops mencatat ukuran <b>{OPS_NAME[ops]}</b> untuk booking ini. Yakin pakai{" "}
        <b>{TITLE[paper] ?? paperLabel(paper)}</b>?
      </span>
    </p>
  );
}
