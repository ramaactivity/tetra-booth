import type { Metadata } from "next";
import { loadPublicGallery } from "@/lib/gallery";
import { loadPromo } from "@/lib/promo";
import { PublicGallery } from "./PublicGallery";

export const metadata: Metadata = {
  title: "Galeri acara · Tetra Photobooth",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/** Galeri publik untuk tamu (FSD §3, DECISIONS #72): read-only, dibuka dari halaman foto tamu. */
export default async function PublicGalleryPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const g = await loadPublicGallery(sessionId);
  const promo = g.state === "ok" ? await loadPromo(g.eventId) : null;
  return <PublicGallery g={g} back={`/s/${sessionId}`} promo={promo} />;
}
