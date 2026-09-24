"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Muat ulang data server berkala (FSD §2: pending 5 dtk, unknown 15 dtk) tanpa reload halaman. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
