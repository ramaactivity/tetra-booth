import type { Metadata } from "next";

/** Galeri klien. FSD §3. Dibangun di Fase 3. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ClientGallery({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main className="p-6 text-sm text-muted">Galeri {token.slice(0, 6)}… (Fase 3)</main>;
}
