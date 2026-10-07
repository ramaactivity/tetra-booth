import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Bahan dasar layar tamu Guest Cam v2 (#209, gaya kamera retro): hitam penuh, teks terang, satu tombol utama
 * butter di bawah. Tidak scroll di 390×844; area aman notch/home bar dihormati.
 */

/** Layar penuh tanpa bar browser: Fullscreen API saat ada ketukan (Android). iOS Safari menolak, diam saja. */
export function goFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  void el
    .requestFullscreen({ navigationUI: "hide" })
    .then(() =>
      (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })
        .lock?.("portrait")
        .catch(() => {}),
    )
    .catch(() => {});
}

export function Screen({
  children,
  bottom,
  className = "",
}: {
  children: ReactNode;
  bottom?: ReactNode;
  className?: string;
}) {
  return (
    <main
      className={`mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-black px-5 pt-[max(20px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))] text-paper motion-safe:animate-[enter_.25s_ease-out] ${className}`}
    >
      {children}
      <div className="flex-1" />
      {bottom && <div className="mt-5 flex flex-col gap-3">{bottom}</div>}
    </main>
  );
}

/** Bar atas: kiri tombol kembali (opsional), tengah judul kecil, kanan isi bebas. */
export function TopBar({
  onBack,
  title,
  sub,
  right,
}: {
  onBack?: (() => void) | undefined;
  title?: string | undefined;
  sub?: string | undefined;
  right?: ReactNode;
}) {
  return (
    <div className="grid h-12 grid-cols-[48px_1fr_48px] items-center">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali"
          className="flex size-11 items-center justify-center rounded-full bg-text-3 text-xl font-bold"
        >
          ‹
        </button>
      ) : (
        <span />
      )}
      <div className="min-w-0 text-center">
        {title && <div className="truncate text-[15px] font-extrabold">{title}</div>}
        {sub && <div className="truncate font-mono text-[11px] text-muted">{sub}</div>}
      </div>
      <div className="flex justify-end">{right}</div>
    </div>
  );
}

export function Primary({ className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...p}
      className={`flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-butter text-base font-extrabold text-ink transition-transform active:scale-[.98] disabled:bg-text-3 disabled:text-muted ${className}`}
    />
  );
}
export function Secondary({ className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...p}
      className={`flex h-14 items-center justify-center gap-2 rounded-full bg-text-3 px-6 text-[15px] font-bold text-paper transition-transform active:scale-[.98] disabled:opacity-50 ${className}`}
    />
  );
}
export function TextLink({ className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...p}
      className={`min-h-12 text-center text-sm font-bold text-paper/80 underline underline-offset-4 ${className}`}
    />
  );
}

export const H1 = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <h1
    className={`text-[30px] leading-[1.05] font-extrabold tracking-[-0.035em] text-balance max-[380px]:text-[26px] ${className}`}
  >
    {children}
  </h1>
);
export const Lead = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <p className={`mt-2.5 text-[15px] leading-[1.5] text-paper/70 text-pretty ${className}`}>
    {children}
  </p>
);
export function Tag({ bg, children }: { bg: string; children: ReactNode }) {
  return (
    <span
      className={`flex h-7 items-center self-start rounded-full px-3 text-xs font-extrabold text-ink ${bg}`}
    >
      {children}
    </span>
  );
}

/** Ikon kamera retro (laci pilihan preset, gaya Dazz): bodi berwarna, lensa, jendela bidik, flash. */
export function CameraIcon({ body, size = 56 }: { body: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect x="18" y="12" width="14" height="7" rx="2" fill="#3A3936" />
      <rect
        x="6"
        y="17"
        width="52"
        height="34"
        rx="8"
        fill={body}
        stroke="#1D1D1B"
        strokeWidth="2"
      />
      <rect
        x="42"
        y="21"
        width="10"
        height="6"
        rx="1.5"
        fill="#fff"
        stroke="#1D1D1B"
        strokeWidth="1.5"
      />
      <circle cx="30" cy="34" r="12" fill="#1D1D1B" />
      <circle cx="30" cy="34" r="8" fill="#3A3936" stroke="#8A8883" strokeWidth="1.5" />
      <circle cx="27" cy="31" r="2.5" fill="#fff" opacity=".7" />
    </svg>
  );
}

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
