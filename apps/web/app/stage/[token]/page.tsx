import type { Metadata } from "next";
import { headers } from "next/headers";
import { loadStageDisplay } from "@/lib/stage-display";
import { StageDisplayView } from "./StageDisplayView";

export const metadata: Metadata = {
  title: "Photo Stage · Tetra Photobooth",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/** Layar galeri Photo Stage untuk device kedua (#204): link live yang sama, `/stage/{slug}`. */
export default async function StagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await loadStageDisplay(token);
  if (!d)
    return (
      <main className="flex min-h-dvh items-center justify-center bg-paper text-2xl font-bold text-text-2">
        Layar Photo Stage tidak tersedia
      </main>
    );
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  return <StageDisplayView token={token} origin={origin} initial={d} />;
}
