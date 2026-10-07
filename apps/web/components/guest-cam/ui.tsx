import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Bahan dasar layar tamu Guest Cam (desain G5, Spesifikasi §1): layar paper 52/20/28 px yang tidak scroll di
 * 390×844, tombol utama h56 r14 berlapis 4 px, pil bergaris tinta tanpa transparansi.
 */

export const mono = "font-mono";

/** Layar paper (A1, A2, A5, A7–A10): isi + bar bawah bergaris putus-putus. */
export function Screen({ children, bottom }: { children: ReactNode; bottom?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-paper px-5 pt-[52px] pb-[calc(28px+env(safe-area-inset-bottom))] motion-safe:animate-[enter_.25s_ease-out] max-[380px]:pt-10">
      {children}
      <div className="flex-1" />
      {bottom && (
        <div className="-mx-5 mt-4 flex flex-col gap-3 border-t-[1.5px] border-dashed border-ink px-5 pt-[18px]">
          {bottom}
        </div>
      )}
    </main>
  );
}

/** Header layar: nama acara + baris mono (tanggal / info), kanan logo T atau tombol tutup. */
export function Head({
  title,
  sub,
  onClose,
  onBack,
  backLabel,
  right,
}: {
  title: string;
  sub?: string | undefined;
  onClose?: (() => void) | undefined;
  onBack?: (() => void) | undefined;
  backLabel?: string | undefined;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="flex size-8 flex-none items-center justify-center rounded-full border-[1.5px] border-ink text-base font-extrabold"
          >
            ‹
          </button>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="truncate text-[15px] font-extrabold tracking-[-0.02em]">{title}</div>
          {sub && <div className={`${mono} text-[11px] text-text-2`}>{sub}</div>}
        </div>
      </div>
      {right ??
        (onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex size-8 flex-none items-center justify-center rounded-full border-[1.5px] border-ink text-sm font-extrabold"
          >
            ✕
          </button>
        ) : (
          <TLogo />
        ))}
    </div>
  );
}

export const TLogo = () => (
  <span className="flex size-8 flex-none items-center justify-center rounded-[10px] border-[1.5px] border-ink bg-mint text-sm font-extrabold">
    T
  </span>
);

const btnBase =
  "layered pressable flex h-14 items-center justify-center gap-2.5 rounded-[14px] border-[1.5px] border-ink text-base font-extrabold [--lb:1.5px] [--lx:4px] disabled:bg-neutral disabled:text-muted disabled:shadow-none";

/** Tombol utama butter (satu per layar). */
export function Primary({ className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...p} className={`${btnBase} w-full bg-butter ${className}`} />;
}
/** Tombol kedua putih, lebar tetap 132 px di samping tombol utama. */
export function Secondary({ className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...p}
      className={`${btnBase} w-[132px] flex-none bg-white text-[15px] ${className}`}
    />
  );
}
export function TextLink({ className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...p}
      className={`min-h-12 text-center text-[13px] font-bold underline ${className}`}
    />
  );
}

/** Pil status bertulisan (A2b/A2c/A10): warna latar + teks, tanpa makna dari warna saja. */
export function Tag({ bg, children }: { bg: string; children: ReactNode }) {
  return (
    <div
      className={`flex h-[30px] items-center self-start rounded-full border-[1.5px] border-ink px-3 text-xs font-bold ${bg}`}
    >
      {children}
    </div>
  );
}

export const H1 = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <h1
    className={`text-[29px] leading-[1.08] font-extrabold tracking-[-0.035em] text-balance max-[380px]:text-[25px] ${className}`}
  >
    {children}
  </h1>
);
export const Lead = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <p className={`mt-2.5 text-sm leading-[1.55] text-text-3 text-pretty ${className}`}>{children}</p>
);

/** Kartu putih berlapis 6 px (A5/A7b/A8b). */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`layered rounded-[22px] border-[1.5px] border-ink p-[18px] [--lb:1.5px] [--lx:6px] ${className}`}
    >
      {children}
    </div>
  );
}

/** Tanggal acara di header tamu: 12.12.2026. */
export const dotDate = (iso: string) => iso.split("-").reverse().join(".");
export const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;
export const longDateId = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(`${iso.slice(0, 10)}T12:00:00`),
  );
export const shortDateId = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
