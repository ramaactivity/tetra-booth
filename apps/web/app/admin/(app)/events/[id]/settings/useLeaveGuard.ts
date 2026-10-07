"use client";
import { useEffect } from "react";

/**
 * Isian belum disimpan: tanya dulu saat menutup tab/reload, atau saat mengklik link lain di admin
 * (navigasi Next tidak memicu beforeunload). Link anchor (#…) dan tab baru tidak ditanya.
 */
export function useLeaveGuard(dirty: boolean, message: string) {
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest("a[href]");
      const href = a?.getAttribute("href");
      if (!href || href.startsWith("#") || a?.getAttribute("target") === "_blank") return;
      if (!confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}
