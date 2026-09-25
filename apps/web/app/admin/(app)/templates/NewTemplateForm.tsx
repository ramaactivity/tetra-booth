"use client";
import { LAYOUT_PRESETS } from "@tetra/shared";
import { useActionState, useState } from "react";
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
    <form action={action} className="flex flex-wrap items-center gap-2.5">
      <input
        name="name"
        required
        placeholder="Nama template, mis. Andi & Sari — 4R"
        className={`${input} w-72`}
      />
      <select name="preset" aria-label="Mulai dari" className={input} defaultValue="4r-grid">
        {Object.entries(LAYOUT_PRESETS).map(([id, p]) => (
          <option key={id} value={id}>
            {p.name} · {p.info}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className={primary}>
        Buat
      </button>
      {error && <p className="basis-full text-sm font-semibold text-coral-strong">{error}</p>}
    </form>
  );
}
