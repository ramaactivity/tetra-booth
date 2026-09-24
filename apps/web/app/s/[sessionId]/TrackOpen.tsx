"use client";
import { useEffect } from "react";
import { track } from "./track";

let opened = "";

/** qr_open: sekali per kunjungan halaman sesi yang dikenal server (juga saat refresh otomatis / StrictMode). */
export function TrackOpen({ sessionId }: { sessionId: string }) {
  useEffect(() => {
    if (opened === sessionId) return;
    opened = sessionId;
    track(sessionId, "qr_open");
  }, [sessionId]);
  return null;
}
