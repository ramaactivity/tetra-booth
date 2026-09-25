"use client";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * Panel mengambang untuk dropdown & color picker (pengganti kontrol bawaan browser, DECISIONS #77).
 * Diletakkan di body dengan posisi `fixed` dari anchor, jadi tidak terpotong panel yang bisa di-scroll.
 */
export function Popover({
  anchor,
  open,
  onClose,
  children,
  width,
  align = "start",
  label,
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Default = lebar anchor. */
  width?: number;
  align?: "start" | "end";
  label?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; w: number; up: boolean } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const w = width ?? r.width;
      const h = panel.current?.offsetHeight ?? 320;
      const up = r.bottom + 6 + h > window.innerHeight && r.top - 6 - h > 0;
      const left = Math.min(
        Math.max(8, align === "end" ? r.right - w : r.left),
        window.innerWidth - w - 8,
      );
      setPos({ top: up ? r.top - 6 - h : r.bottom + 6, left, w, up });
    };
    place();
    const raf = requestAnimationFrame(place); // ulang setelah tinggi panel diketahui
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchor, width, align]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        anchor.current?.focus();
      }
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [open, onClose, anchor]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.w }}
      className="layered fixed z-50 animate-[fade_.12s_ease-out] rounded-[14px] border-[1.5px] border-ink bg-white [--lb:1.5px] [--lx:4px]"
    >
      {children}
    </div>,
    document.body,
  );
}
