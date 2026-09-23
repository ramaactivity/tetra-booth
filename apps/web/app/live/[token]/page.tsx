import type { Metadata } from "next";

/** Live slideshow. FSD §4. Dibangun di Fase 3. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function LivePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main className="p-6 text-sm text-muted">Live {token.slice(0, 6)}… (Fase 3)</main>;
}
