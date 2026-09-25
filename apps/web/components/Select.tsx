"use client";
import { type CSSProperties, type ReactNode, useId, useMemo, useRef, useState } from "react";
import { Popover } from "./Popover";

export type SelectOption = {
  value: string;
  label: string;
  /** Teks kecil di kanan (mis. format, jumlah). */
  hint?: string;
  group?: string;
  /** Gaya label, mis. fontFamily untuk pratinjau font. */
  style?: CSSProperties;
};

export function Chevron({ open }: { open?: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className={`size-3 flex-none transition-transform duration-150 ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Dropdown Tetra (pengganti `<select>` bawaan, DECISIONS #77). `searchable` = kotak cari di atas daftar
 * (untuk daftar nama: event, font). `name` = input tersembunyi supaya tetap jalan di `<form>` biasa.
 */
export function Select({
  value,
  onChange,
  options,
  name,
  label,
  placeholder = "Pilih…",
  searchable,
  size = "md",
  className = "",
  footer,
  menuWidth,
}: {
  value: string;
  onChange?: (v: string) => void;
  options: SelectOption[];
  name?: string;
  /** Nama aksesibel (dipakai juga oleh test). */
  label: string;
  placeholder?: string;
  searchable?: boolean;
  size?: "sm" | "md";
  className?: string;
  footer?: ReactNode;
  /** Lebar daftar (px) kalau tombolnya lebih sempit dari isi, mis. nama font. */
  menuWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [inner, setInner] = useState(value);
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const current = onChange ? value : inner;
  const sel = options.find((o) => o.value === current);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s)) : options;
  }, [options, q]);

  const show = () => {
    setQ("");
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === current),
      ),
    );
    setOpen(true);
  };
  const choose = (v: string) => {
    if (onChange) onChange(v);
    else setInner(v);
    setOpen(false);
    btn.current?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return show();
      const d = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + d + list.length) % Math.max(1, list.length));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      const o = list[active];
      if (o) choose(o.value);
    }
  };

  const h = size === "sm" ? "h-9 text-[13px]" : "h-10 text-sm";
  let lastGroup: string | undefined;
  return (
    <>
      {name && <input type="hidden" name={name} value={current} />}
      <button
        ref={btn}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="listbox"
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        className={`flex ${/(^|\s)w-/.test(className) ? "" : "w-full"} min-w-0 items-center justify-between gap-2 rounded-[11px] border-[1.5px] border-ink bg-white px-3 text-left font-medium outline-none focus-visible:ring-2 focus-visible:ring-mint ${h} ${className}`}
      >
        <span className={`truncate ${sel ? "" : "text-muted"}`} style={sel?.style}>
          {sel?.label ?? placeholder}
        </span>
        <Chevron open={open} />
      </button>
      <Popover
        anchor={btn}
        open={open}
        onClose={() => setOpen(false)}
        label={label}
        width={menuWidth}
      >
        {searchable && (
          <div className="border-b-[1.5px] border-dashed border-ink p-2">
            <input
              // biome-ignore lint/a11y/noAutofocus: kotak cari langsung aktif saat dropdown dibuka
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKey}
              placeholder="Cari…"
              aria-label={`Cari ${label.toLowerCase()}`}
              className="h-9 w-full rounded-[9px] border-[1.5px] border-ink bg-paper px-2.5 text-[13px] outline-none focus:bg-white"
            />
          </div>
        )}
        <div
          id={id}
          role="listbox"
          aria-label={label}
          className="max-h-[320px] overflow-y-auto p-1.5"
        >
          {list.map((o, i) => {
            const head = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            const on = o.value === current;
            return (
              <div key={o.value}>
                {head && (
                  <p className="px-2 pt-2 pb-1 text-[10px] font-bold tracking-wide text-muted uppercase">
                    {head}
                  </p>
                )}
                <div
                  role="option"
                  tabIndex={-1}
                  aria-selected={on}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => choose(o.value)}
                  onKeyDown={onKey}
                  className={`flex cursor-pointer items-center gap-2 rounded-[9px] px-2.5 py-2 text-sm ${i === active ? "bg-paper" : ""} ${on ? "font-bold" : ""}`}
                >
                  <span className="size-3.5 flex-none text-center text-xs">{on ? "✓" : ""}</span>
                  <span className="min-w-0 flex-1 truncate" style={o.style}>
                    {o.label}
                  </span>
                  {o.hint && <span className="font-mono text-[11px] text-text-2">{o.hint}</span>}
                </div>
              </div>
            );
          })}
          {!list.length && <p className="px-2.5 py-3 text-sm text-text-2">Tidak ditemukan</p>}
        </div>
        {footer && <div className="border-t-[1.5px] border-dashed border-ink p-2">{footer}</div>}
      </Popover>
    </>
  );
}
