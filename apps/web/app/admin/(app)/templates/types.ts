import { type LayoutPaper, type LayoutSpec, paperShort } from "@tetra/shared";
import type { TemplateRow } from "@/lib/template-list";

/** Satu kartu/baris di daftar Template (#160). `files` = assetId → nama file (pratinjau lewat route aset). */
export type TemplateItem = TemplateRow & {
  mode: "event" | "photobox";
  format: string;
  slots: number;
  version: number;
  layout: LayoutSpec;
  files: Record<string, string>;
};
export type AssignEvent = {
  id: string;
  slug: string;
  name: string;
  date: string;
  mode: "event" | "photobox";
  /** "Unit 2 · 2R" di acara multi-unit (#266); kertas = desain utama event saat ini. */
  unit?: string | undefined;
  paper?: LayoutPaper | undefined;
};

const dateText = (ymd: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${ymd}T00:00:00Z`));

/** Opsi pilihan event "Pasang ke event": nama + unit/ukuran + tanggal (dua unit bernama sama tetap terbedakan). */
export const assignOption = (e: AssignEvent) => ({
  value: e.id,
  label: e.name,
  hint: [e.unit ?? (e.paper && paperShort(e.paper)), dateText(e.date)].filter(Boolean).join(" · "),
});

/**
 * Peringatan pasang template berkertas beda ke event (#267): template jadi desain utama dan desain berkertas lain
 * dilepas, jadi kertas event ikut berubah. Tidak diblokir, karena ganti ukuran bisa disengaja. Photobox tidak.
 */
export const paperSwapWarning = (e: AssignEvent | undefined, paper: LayoutPaper) =>
  e?.mode === "event" && e.paper && e.paper !== paper
    ? `${e.unit?.split(" · ")[0] ?? "Event ini"} sekarang ${paperShort(e.paper)}. Memasang template ${paperShort(paper)} mengubahnya jadi ${paperShort(paper)} dan melepas desain ${paperShort(e.paper)}-nya.`
    : null;
export type WizardTemplate = Pick<
  TemplateItem,
  "id" | "name" | "mode" | "layout" | "version" | "files"
>;
export type WizardPreset = {
  id: string;
  name: string;
  paper: string;
  width: number;
  height: number;
  slots: LayoutSpec["slots"];
};
