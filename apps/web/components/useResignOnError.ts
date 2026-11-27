"use client";
import { useRouter } from "next/navigation";
import { useRef } from "react";

/**
 * Gambar gagal dimuat (biasanya link R2 bertanda tangan sudah kedaluwarsa di tab yang dibuka lagi berjam-jam
 * kemudian): minta server menandatangani ulang, sekali saja per halaman (audit 27 Nov).
 */
export function useResignOnError() {
  const router = useRouter();
  const done = useRef(false);
  return () => {
    if (done.current) return;
    done.current = true;
    router.refresh();
  };
}
