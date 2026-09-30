import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary = aksi utama (butter + lapisan), secondary = putih + lapisan, plain = tanpa lapisan,
   *  destructive = coral putus-putus. Ukuran (tinggi, radius, font) diberi lewat className per layar. */
  variant?: "primary" | "secondary" | "plain" | "destructive";
};

// Label panjang boleh 2 baris (seimbang) daripada menabrak garis tombol (audit UX 30 Sep).
const base =
  "pressable inline-flex items-center justify-center gap-3 border-ink text-ink text-center leading-tight text-balance select-none disabled:opacity-40";
/** Jarak kiri-kanan bawaan; dilewati kalau pemanggil sudah memberi padding sendiri. */
const PAD = /(^|\s)(p|px|pl|pr|ps|pe)-/;
const variants = {
  primary: "layered bg-butter border-[2.5px] font-extrabold",
  secondary: "layered bg-white border-[2.5px] font-bold",
  plain: "bg-paper border-[2.5px] font-bold",
  destructive: "bg-coral border-[2.5px] border-dashed font-bold",
} as const;

export function Button({ variant = "primary", className = "", ...rest }: Props) {
  const pad = PAD.test(className) ? "" : "px-6";
  return (
    <button
      type="button"
      className={`${base} ${pad} ${variants[variant]} ${className}`}
      {...rest}
    />
  );
}
