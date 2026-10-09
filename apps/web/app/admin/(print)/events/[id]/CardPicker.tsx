import { CARD_DESIGNS } from "@/lib/guest-card-art";
import { PrintButton } from "./business-card/PrintButton";

/** Pilihan desain + ukuran di halaman cetak kartu QR (#227); tautan biasa, tidak ikut tercetak. */
export function CardPicker({
  design,
  sizes,
  size,
}: {
  design: string;
  sizes?: { id: string; label: string }[];
  size?: string;
}) {
  const q = (d: string, s?: string) => `?d=${d}${s ? `&size=${s}` : ""}`;
  const chip = (on: boolean) =>
    `flex h-10 items-center rounded-[11px] border-[1.5px] border-ink px-3.5 text-sm font-bold no-underline ${on ? "bg-lavender" : "bg-white"}`;
  return (
    <div className="flex flex-col items-center gap-3 print:hidden">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {CARD_DESIGNS.map((c) => (
          <a
            key={c.id}
            href={q(c.id, size)}
            aria-current={c.id === design}
            title={c.hint}
            className={chip(c.id === design)}
          >
            {c.name}
          </a>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {sizes?.map((s) => (
          <a
            key={s.id}
            href={q(design, s.id)}
            aria-current={s.id === size}
            className={chip(s.id === size)}
          >
            {s.label}
          </a>
        ))}
        <PrintButton />
      </div>
    </div>
  );
}
