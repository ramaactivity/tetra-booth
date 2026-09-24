import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary = aksi utama (butter + lapisan), secondary = putih + lapisan, plain = tanpa lapisan,
   *  destructive = coral putus-putus. Ukuran (tinggi, radius, font) diberi lewat className per layar. */
  variant?: "primary" | "secondary" | "plain" | "destructive";
};

const base =
  "pressable inline-flex items-center justify-center gap-3 border-ink text-ink whitespace-nowrap select-none disabled:opacity-40";
const variants = {
  primary: "layered bg-butter border-[2.5px] font-extrabold",
  secondary: "layered bg-white border-[2.5px] font-bold",
  plain: "bg-paper border-[2.5px] font-bold",
  destructive: "bg-coral border-[2.5px] border-dashed font-bold",
} as const;

export function Button({ variant = "primary", className = "", ...rest }: Props) {
  return <button type="button" className={`${base} ${variants[variant]} ${className}`} {...rest} />;
}
