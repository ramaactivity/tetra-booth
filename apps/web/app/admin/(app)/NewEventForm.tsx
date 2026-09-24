"use client";
import { useActionState, useState } from "react";
import { createEvent } from "./events/actions";

const input = "h-11 rounded-xl border-[1.5px] border-ink bg-white px-3.5 text-sm";
const primary =
  "pressable layered h-11 rounded-xl border-[1.5px] border-ink bg-butter px-[18px] text-sm font-extrabold [--lb:1.5px] [--lx:4px]";

export function NewEventForm() {
  const [open, setOpen] = useState(false);
  const [error, action, pending] = useActionState(createEvent, null);
  if (!open)
    return (
      <button type="button" className={primary} onClick={() => setOpen(true)}>
        + Buat Event
      </button>
    );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2.5">
      <input
        name="name"
        required
        placeholder="Nama event, mis. Andi & Sari Wedding"
        className={`${input} w-72`}
      />
      <input name="event_date" type="date" required aria-label="Tanggal event" className={input} />
      <button type="submit" disabled={pending} className={primary}>
        Buat
      </button>
      {error && <p className="basis-full text-sm font-semibold text-coral-strong">{error}</p>}
    </form>
  );
}
