"use client";

import { useEffect, useState } from "react";

/**
 * "Layar penuh" untuk layar galeri yang dibuka di browser (laptop/TV kedua): sudut kiri bawah (kanan atas menutupi QR), samar sampai
 * disorot; hilang saat sudah layar penuh atau browser tidak mendukung (mis. Safari iPhone).
 */
export function FullscreenButton({ label = "Layar penuh" }: { label?: string }) {
  // Tersembunyi sampai terpasang: render server & hidrasi pertama sama.
  const [hide, setHide] = useState(true);
  useEffect(() => {
    const f = () => setHide(!!document.fullscreenElement || !document.fullscreenEnabled);
    f();
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);
  if (hide) return null;
  return (
    <button
      type="button"
      onClick={() => void document.documentElement.requestFullscreen().catch(() => {})}
      className="pressable fixed bottom-3 left-3 z-50 rounded-full border-2 border-ink bg-white px-4 py-1.5 text-sm font-bold text-ink opacity-40 transition-opacity duration-300 hover:opacity-100 focus-visible:opacity-100"
    >
      {label}
    </button>
  );
}
