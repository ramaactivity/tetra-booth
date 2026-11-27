"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Muat ulang data server berkala (FSD §2: pending 5 dtk, unknown 15 dtk) tanpa reload halaman. Tidak jalan saat tab
 * tersembunyi dan berhenti setelah `stopAfterMin` (audit 27 Nov: sesi yang tidak pernah sampai dulu dipolling
 * selamanya, tiap kali satu panggilan server + query database).
 */
export function AutoRefresh({
  seconds,
  stopAfterMin = 30,
}: {
  seconds: number;
  stopAfterMin?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    const end = Date.now() + stopAfterMin * 60_000;
    const t = setInterval(() => {
      if (Date.now() > end) return clearInterval(t);
      if (!document.hidden) router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds, stopAfterMin]);
  return null;
}
