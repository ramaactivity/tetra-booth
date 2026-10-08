import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

/**
 * Kosakata layout mode crew (perombakan UI crew, Okt 2026): satu pola di semua halaman supaya crew belajar sekali.
 * Halaman = judul → strip status (keadaan sekarang + satu aksi utama) → panel berisi baris (label kiri, kontrol kanan).
 */

export type Tone = "mint" | "sky" | "peach" | "lavender" | "coral" | "butter" | "white";
export const FILL: Record<Tone, string> = {
  mint: "var(--mint-soft)",
  sky: "var(--sky)",
  peach: "var(--peach)",
  lavender: "var(--lavender)",
  coral: "var(--coral)",
  butter: "var(--butter)",
  white: "#fff",
};

export const dot = <span className="mr-1.5 inline-block size-2 rounded-full bg-ink align-middle" />;

/** Label status bulat: selalu teks + titik (bukan warna saja). */
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      style={{ background: FILL[tone] }}
      className="inline-flex items-center rounded-full border-2 border-ink px-3.5 py-1 text-lg font-bold whitespace-nowrap"
    >
      {children}
    </span>
  );
}

/** Kelompok berjudul di satu halaman. `aside` = pill/aksi kecil di kanan judul. */
export function Panel({
  title,
  hint,
  aside,
  testId,
  className = "",
  children,
}: {
  title: string;
  hint?: ReactNode;
  aside?: ReactNode;
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      className={`flex min-w-0 flex-col gap-5 rounded-[26px] border-[2.5px] border-ink bg-white p-7 ${className}`}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-[26px] leading-tight font-extrabold">{title}</h2>
          {hint && <p className="text-lg font-medium text-text-2">{hint}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** Satu baris setelan: nama + keterangan di kiri, kontrol di kanan. Baris berturut dipisah garis putus. */
export function Row({
  label,
  hint,
  testId,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  testId?: string;
  children?: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className="flex min-h-[76px] items-center justify-between gap-6 border-t-2 border-dashed border-line-soft pt-4 first:border-0 first:pt-0"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xl font-bold">{label}</span>
        {hint && <span className="text-lg font-medium text-text-2">{hint}</span>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-3">{children}</div>}
    </div>
  );
}

/**
 * Sakelar satu baris (seluruh baris bisa diketuk): nama setelan + keterangan di kiri, keadaan di kanan.
 * Nama aksesibel = nama setelan, keadaan lewat aria-pressed.
 */
export function ToggleRow({
  label,
  hint,
  on,
  onLabel,
  offLabel,
  disabled = false,
  onClick,
  testId,
}: {
  label: string;
  hint?: ReactNode;
  on: boolean;
  onLabel: string;
  offLabel: string;
  disabled?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-[76px] w-full items-center justify-between gap-6 border-t-2 border-dashed border-line-soft pt-4 text-left first:border-0 first:pt-0 disabled:opacity-40"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-xl font-bold">{label}</span>
        {hint && <span className="text-lg font-medium text-text-2">{hint}</span>}
      </span>
      <span
        aria-hidden
        className={`pressable flex h-14 w-[132px] shrink-0 items-center justify-center rounded-full border-[2.5px] border-ink text-xl font-bold ${on ? "bg-mint" : "bg-white text-text-2"}`}
      >
        {on ? onLabel : offLabel}
      </span>
    </button>
  );
}

/**
 * Pilihan besar (kamera, printer, peran laptop): judul, keterangan kecil, label tambahan. Terpilih = isian mint +
 * tanda "Dipilih"; tidak memakai warna saja.
 */
export function Choice({
  title,
  detail,
  tag,
  selected,
  disabled = false,
  onClick,
  testId,
}: {
  title: string;
  detail?: string | undefined;
  tag?: string | undefined;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`pressable flex min-h-[112px] min-w-0 flex-col items-start justify-between gap-2 rounded-[20px] border-[2.5px] border-ink px-5 py-4 text-left disabled:opacity-45 ${selected ? "layered bg-mint-soft [--lx:6px]" : "bg-white"}`}
    >
      <span className="flex w-full items-start justify-between gap-3">
        <span className="text-[22px] leading-tight font-extrabold">{title}</span>
        {selected && (
          <span className="shrink-0 rounded-full border-2 border-ink bg-mint px-2.5 text-base font-bold">
            Dipilih
          </span>
        )}
      </span>
      {detail && <span className="text-base leading-snug font-medium text-text-2">{detail}</span>}
      {tag && (
        <span className="rounded-full border-2 border-dashed border-ink bg-paper px-2.5 text-base font-bold">
          {tag}
        </span>
      )}
    </button>
  );
}

/** Strip status di atas halaman: ikon, keadaan sekarang (besar), keterangan, lalu satu aksi utama di kanan. */
export function StatusStrip({
  icon: Icon,
  tone,
  title,
  detail,
  pill,
  children,
}: {
  icon: LucideIcon;
  tone: Tone;
  title: ReactNode;
  detail?: ReactNode;
  pill?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      style={{ "--under": FILL[tone] } as CSSProperties}
      className="layered flex items-center gap-6 rounded-[26px] border-[2.5px] border-ink bg-white px-7 py-6 [--lx:8px]"
    >
      <span
        style={{ background: FILL[tone] }}
        className="flex size-16 shrink-0 items-center justify-center rounded-[16px] border-2 border-dashed border-ink"
      >
        <Icon size={30} strokeWidth={2} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[30px] leading-tight font-extrabold">{title}</span>
          {pill}
        </div>
        {detail && <span className="text-lg font-medium text-text-2">{detail}</span>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-4">{children}</div>}
    </section>
  );
}

/** Tombol ukuran standar mode crew (tinggi 76 px: nyaman disentuh, tidak raksasa di laptop). */
export const btn = "h-[76px] rounded-[20px] px-8 text-xl";
