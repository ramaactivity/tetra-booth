import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  /** `booth`: tinggi >= 72px untuk layar sentuh. 08-DESIGN §4. */
  size?: "booth" | "web";
};

const base =
  "inline-flex items-center justify-center rounded font-medium uppercase tracking-label select-none disabled:opacity-40";
const variants = {
  primary: "bg-accent text-on-accent",
  secondary: "border-[1.5px] border-fg bg-transparent text-fg",
} as const;
const sizes = {
  booth: "min-h-[72px] px-12 text-lg",
  web: "min-h-12 px-6 text-sm",
} as const;

export function Button({ variant = "primary", size = "web", className = "", ...rest }: Props) {
  return (
    <button
      type="button"
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    />
  );
}
