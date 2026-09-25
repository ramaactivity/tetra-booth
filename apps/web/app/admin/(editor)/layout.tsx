import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireMember } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Editor Template · Tetra Admin",
  robots: { index: false },
};

/** Editor layar penuh (tanpa sidebar admin), seperti Canva. Owner/admin saja. */
export default async function EditorLayout({ children }: { children: ReactNode }) {
  await requireMember(["owner", "admin"]);
  return <div className="h-dvh overflow-hidden bg-paper">{children}</div>;
}
