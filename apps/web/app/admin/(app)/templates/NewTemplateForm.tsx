"use client";
import { LAYOUT_PRESETS, type PresetId } from "@tetra/shared";
import { Select } from "@tetra/ui";
import { useActionState, useState } from "react";
import { createTemplate } from "./actions";

const FORMATS = ["4R", "2R", "Polaroid"] as const;
const ORIENTS = [
  ["portrait", "Portrait"],
  ["landscape", "Landscape"],
] as const;
/** Tata letak untuk format + orientasi, dari `group` preset (mis. "2R landscape"). */
const layoutsOf = (format: string, orient: string) =>
  (Object.entries(LAYOUT_PRESETS) as [PresetId, (typeof LAYOUT_PRESETS)[PresetId]][]).filter(
    ([, p]) => p.group === `${format} ${orient}`,
  );

const input = "h-11 rounded-xl border-[1.5px] border-ink bg-white px-3.5 text-sm";
const primary =
  "pressable layered h-11 rounded-xl border-[1.5px] border-ink bg-butter px-[18px] text-sm font-extrabold [--lb:1.5px] [--lx:4px]";

export function NewTemplateForm() {
  const [open, setOpen] = useState(false);
  const [error, action, pending] = useActionState(createTemplate, null);
  const [format, setFormat] = useState<string>("4R");
  const [orient, setOrient] = useState<string>("portrait");
  const [preset, setPreset] = useState<string>("4r-grid");
  const layouts = layoutsOf(format, orient);
  // Format/orientasi berubah: pilih tata letak pertama yang sesuai.
  const pick = (f: string, o: string) => {
    setFormat(f);
    setOrient(o);
    setPreset(layoutsOf(f, o)[0]?.[0] ?? "4r-grid");
  };
  if (!open)
    return (
      <button type="button" className={primary} onClick={() => setOpen(true)}>
        + Buat Template
      </button>
    );
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2.5">
      <input
        name="name"
        required
        placeholder="Nama template, mis. Andi & Sari"
        className={`${input} w-64`}
      />
      <Select
        label="Format"
        value={format}
        onChange={(f) => pick(f, orient)}
        className="h-11 w-32 rounded-xl"
        options={FORMATS.map((f) => ({ value: f, label: f }))}
      />
      <fieldset
        aria-label="Orientasi"
        className="m-0 flex p-0 h-11 overflow-hidden rounded-xl border-[1.5px] border-ink bg-white text-[13px] font-bold"
      >
        {ORIENTS.map(([v, l]) => (
          <button
            key={v}
            type="button"
            aria-pressed={orient === v}
            onClick={() => pick(format, v)}
            className={`px-3.5 not-first:border-l-[1.5px] not-first:border-ink ${orient === v ? "bg-lavender" : "hover:bg-paper"}`}
          >
            {l}
          </button>
        ))}
      </fieldset>
      <Select
        name="preset"
        label="Tata letak"
        value={preset}
        onChange={setPreset}
        className="h-11 w-52 rounded-xl"
        menuWidth={240}
        options={layouts.map(([id, p]) => ({
          value: id,
          label: p.name,
          hint: `${p.layout.slots.length} foto`,
        }))}
      />
      <button type="submit" disabled={pending} className={primary}>
        Buat
      </button>
      {error && <p className="basis-full text-sm font-semibold text-coral-strong">{error}</p>}
    </form>
  );
}
