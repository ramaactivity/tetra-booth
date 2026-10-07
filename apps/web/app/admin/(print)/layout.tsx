import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireMember } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Cetak · Tetra Admin", robots: { index: false } };

/** Halaman cetak (kartu QR meja Guest Cam, #203): tanpa sidebar admin. Owner/admin saja. */
export default async function PrintLayout({ children }: { children: ReactNode }) {
  await requireMember(["owner", "admin"]);
  return <div className="min-h-dvh bg-neutral print:bg-white">{children}</div>;
}
