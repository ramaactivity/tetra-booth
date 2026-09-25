import type { Metadata } from "next";
import { headers } from "next/headers";
import { loadLive } from "@/lib/live";
import { LiveView } from "./LiveView";

export const metadata: Metadata = {
  title: "Live · Tetra Photobooth",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/** Live slideshow untuk layar/proyektor di venue (FSD §4, desain D1). */
export default async function LivePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const live = await loadLive(token);
  if (!live)
    return (
      <main className="flex min-h-dvh items-center justify-center bg-paper text-2xl font-bold text-text-2">
        Slideshow tidak tersedia
      </main>
    );
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  return (
    <LiveView
      token={token}
      event={live.event}
      initial={live.strips}
      galleryUrl={live.event.publicGallery ? `${origin}/l/${token}` : null}
    />
  );
}
