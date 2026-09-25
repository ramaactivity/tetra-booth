import type { Metadata } from "next";
import { PublicGallery } from "@/app/s/[sessionId]/galeri/PublicGallery";
import { loadPublicGalleryByLive } from "@/lib/gallery";

export const metadata: Metadata = {
  title: "Galeri acara · Tetra Photobooth",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/** Galeri publik dari QR di live slideshow (desain D1, DECISIONS #75). */
export default async function LiveGalleryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicGallery g={await loadPublicGalleryByLive(token)} />;
}
