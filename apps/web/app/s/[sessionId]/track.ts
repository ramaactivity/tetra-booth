import type { TrackRequest } from "@tetra/shared";

/** Kirim analytics tanpa menunggu (sendBeacon tetap terkirim walau halaman ditutup). */
export const track = (sessionId: string, type: TrackRequest["type"]) =>
  navigator.sendBeacon("/api/track", JSON.stringify({ sessionId, type } satisfies TrackRequest));
