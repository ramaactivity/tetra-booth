import { Button } from "@tetra/ui";
import { Delete } from "lucide-react";
import { useEffect } from "react";
import { copy } from "../copy";

/** Keypad angka layar crew (A09a): dipakai PIN crew dan kode pairing. */
export function DigitPad({
  title,
  value,
  onChange,
  minBoxes,
  maxLength,
  masked,
  status,
  locked = false,
  onSubmit,
  onCancel,
}: {
  title: string;
  value: string;
  onChange: (v: string) => void;
  /** Kotak yang selalu tampil; bertambah sampai `maxLength` saat diketik. */
  minBoxes: number;
  maxLength: number;
  /** PIN: titik; kode pairing: angkanya tampil. */
  masked: boolean;
  status?: string | null;
  locked?: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const full = locked || value.length >= maxLength;
  // Keyboard laptop juga bisa (masukan Rama): angka / numpad, Backspace, Enter = OK, Esc = batal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        if (!full) onChange(value + e.key);
      } else if (e.key === "Backspace") onChange(value.slice(0, -1));
      else if (e.key === "Enter") {
        if (!locked) onSubmit();
      } else if (e.key === "Escape") onCancel();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [value, full, locked, onChange, onSubmit, onCancel]);
  const boxes = Math.min(maxLength, Math.max(minBoxes, value.length + 1));
  const key =
    "pressable flex h-[92px] items-center justify-center rounded-[22px] border-[2.5px] border-ink bg-white text-[40px] font-bold disabled:opacity-40";
  const digit = (d: string) => (
    <button
      key={d}
      type="button"
      className={key}
      disabled={full}
      onClick={() => onChange(value + d)}
    >
      {d}
    </button>
  );
  return (
    <main className="flex h-full w-full items-center justify-center bg-paper">
      <div className="layered flex flex-col items-center gap-8 rounded-[40px] border-[3px] border-ink bg-white px-[72px] py-14 [--lb:3px] [--lx:14px]">
        <span className="rounded-full border-2 border-ink bg-lavender px-[18px] py-2 text-xl font-bold">
          {copy.crew.title}
        </span>
        <h1 className="text-[52px] font-extrabold tracking-[-0.03em]">{title}</h1>
        <div className="relative flex gap-[18px]" data-testid="pin-dots">
          {Array.from({ length: boxes }, (_, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: posisi digit tetap
              key={i}
              className={`flex h-[84px] w-[72px] items-center justify-center rounded-[18px] border-ink font-mono text-[40px] font-medium ${
                i < value.length
                  ? "border-[2.5px] bg-paper"
                  : i === value.length
                    ? "border-[3px] bg-white shadow-[0_0_0_5px_var(--mint)]"
                    : "border-[2.5px] border-dashed bg-white"
              }`}
            >
              {i < value.length &&
                (masked ? <span className="size-5 rounded-full bg-ink" /> : value[i])}
            </span>
          ))}
          <p
            className="absolute inset-x-[-200px] top-full mt-2 text-center text-xl font-semibold text-text-2"
            role="status"
          >
            {status}
          </p>
        </div>
        <div className="grid grid-cols-[repeat(3,140px)] gap-[18px]">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(digit)}
          <button type="button" className={`${key} bg-paper! text-2xl!`} onClick={onCancel}>
            {copy.crew.cancel}
          </button>
          {digit("0")}
          <button
            type="button"
            aria-label={copy.crew.del}
            className={`${key} bg-paper!`}
            onClick={() => onChange(value.slice(0, -1))}
          >
            <Delete size={40} strokeWidth={2} />
          </button>
          <Button
            className="col-span-3 h-[92px] rounded-[22px] text-[32px]"
            disabled={locked || value.length < minBoxes}
            onClick={onSubmit}
          >
            {copy.crew.ok}
          </Button>
        </div>
      </div>
    </main>
  );
}
