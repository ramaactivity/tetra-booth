import type { Metadata } from "next";

/** Halaman tamu. FSD §2. Dibangun di Fase 2. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function GuestPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <main className="p-6 text-sm text-muted">Sesi {sessionId} (Fase 2)</main>;
}
