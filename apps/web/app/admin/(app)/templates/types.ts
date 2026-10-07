import type { LayoutSpec } from "@tetra/shared";
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
};
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
