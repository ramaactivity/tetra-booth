"use client";
import { LAYOUT_PRESETS } from "@tetra/shared";
import { useActionState, useState } from "react";
import { Select } from "@/components/Select";
import { createTemplate } from "./actions";

const input = "h-11 rounded-xl border-[1.5px] border-ink bg-white px-3.5 text-sm";
const primary =
  "pressable layered h-11 rounded-xl border-[1.5px] border-ink bg-butter px-[18px] text-sm font-extrabold [--lb:1.5px] [--lx:4px]";

export function NewTemplateForm() {
  const [open, setOpen] = useState(false);
  const [error, action, pending] = useActionState(createTemplate, null);
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
        placeholder="Nama template, mis. Andi & Sari — 4R"
        className={`${input} w-72`}
      />
      <Select
        name="preset"
        label="Mulai dari"
        value="4r-grid"
        className="h-11 w-56 rounded-xl"
        options={Object.entries(LAYOUT_PRESETS).map(([id, p]) => ({
          value: id,
          label: p.name,
          hint: p.info,
        }))}
      />
      <button type="submit" disabled={pending} className={primary}>
        Buat
      </button>
      {error && <p className="basis-full text-sm font-semibold text-coral-strong">{error}</p>}
    </form>
  );
}
