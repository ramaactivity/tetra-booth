"use client";
import { useEffect } from "react";

/**
 * Pemadat teks kartu QR (#230, `snapFit` template desainer): elemen `data-fit` yang lebih lebar dari induknya
 * dipadatkan horizontal (satu baris), setelah font Google selesai dimuat. Konsep terpilih di panel digulir ke layar.
 */
export function CardFit() {
  useEffect(() => {
    const fit = () => {
      for (const el of document.querySelectorAll<HTMLElement>("[data-fit]")) {
        el.style.transform = "";
        const w = el.parentElement?.clientWidth ?? 0;
        const sw = el.scrollWidth;
        el.style.transformOrigin = `${el.dataset.fit === "center" ? "center" : "left"} top`;
        if (sw > w) el.style.transform = `scaleX(${w / sw})`;
      }
    };
    void document.fonts.ready.then(fit);
    document
      .querySelector("[data-concept][aria-current=true]")
      ?.scrollIntoView({ block: "nearest" });
  }, []);
  return null;
}
