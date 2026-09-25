"use client";
import { useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { Popover } from "./Popover";

const HEX = /^#[0-9a-f]{6}$/i;
const RECENT_KEY = "tetra.recentColors";
/** Palet v2 + netral yang sering dipakai di strip cetak. */
const PALETTE = [
  "#1d1d1b",
  "#5f5e5a",
  "#ffffff",
  "#f8f7f4",
  "#efede8",
  "#f8d98b",
  "#8edccb",
  "#d6f1ea",
  "#cec8f6",
  "#fce3c6",
  "#d6eef8",
  "#f7d5cc",
  "#e8836f",
  "#5db978",
  "#b08d57",
  "#7a1f2b",
];

const readRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((c) => HEX.test(c)).slice(0, 8) : [];
  } catch {
    return [];
  }
};

function Swatches({
  title,
  colors,
  value,
  pick,
}: {
  title: string;
  colors: string[];
  value: string;
  pick: (c: string) => void;
}) {
  if (!colors.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-bold tracking-wide text-muted uppercase">{title}</p>
      <div className="grid grid-cols-8 gap-1.5">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Warna ${c}`}
            onClick={() => pick(c)}
            style={{ background: c }}
            className={`aspect-square rounded-md border-[1.5px] ${c.toLowerCase() === value.toLowerCase() ? "border-ink ring-2 ring-mint" : "border-ink/30"}`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Color picker Tetra (pengganti `<input type="color">`, DECISIONS #77): area saturasi + hue, hex,
 * warna dokumen, palet Tetra, dan warna terakhir (disimpan di browser).
 */
export function ColorPicker({
  value,
  onChange,
  label,
  name,
  docColors = [],
  showHex = false,
  onCommit,
}: {
  value: string;
  onChange: (c: string) => void;
  label: string;
  /** Input tersembunyi untuk `<form>` biasa. */
  name?: string;
  docColors?: string[];
  showHex?: boolean;
  /** Dipanggil saat popover ditutup (untuk satu langkah undo). */
  onCommit?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [recent, setRecent] = useState<string[]>([]);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (open) setRecent(readRecent());
  }, [open]);

  const close = () => {
    setOpen(false);
    if (HEX.test(value)) {
      const next = [value.toLowerCase(), ...readRecent().filter((c) => c !== value.toLowerCase())];
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next.slice(0, 8)));
      } catch {}
    }
    onCommit?.();
  };
  const docs = [...new Set(docColors.map((c) => c.toLowerCase()))];

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex h-10 items-center gap-2 rounded-[11px] border-[1.5px] border-ink bg-white pr-3 pl-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-mint"
      >
        <span
          className="size-7 rounded-[8px] border-[1.5px] border-ink"
          style={{ background: value }}
        />
        {showHex && <span className="font-mono text-xs uppercase">{value}</span>}
      </button>
      <Popover anchor={btn} open={open} onClose={close} width={264} label={label}>
        <div className="tb-color flex flex-col gap-3 p-3">
          <HexColorPicker color={value} onChange={onChange} />
          <label className="flex items-center gap-2 text-[11px] font-bold text-text-2">
            Hex
            <input
              value={text}
              onChange={(e) => {
                const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
                setText(v);
                if (HEX.test(v)) onChange(v.toLowerCase());
              }}
              className="h-8 min-w-0 flex-1 rounded-[8px] border-[1.5px] border-ink px-2 font-mono text-xs uppercase outline-none focus:ring-2 focus:ring-mint"
            />
          </label>
          <Swatches title="Warna dokumen" colors={docs} value={value} pick={onChange} />
          <Swatches title="Palet Tetra" colors={PALETTE} value={value} pick={onChange} />
          <Swatches title="Terakhir dipakai" colors={recent} value={value} pick={onChange} />
        </div>
      </Popover>
    </>
  );
}
