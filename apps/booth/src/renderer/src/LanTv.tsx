import {
  type BoothPlatform,
  PlatformProvider,
  StageTv,
  type StageTvState,
} from "@tetra/booth-core";

/**
 * Layar TV Photo Stage di browser device kedua (#205): renderer yang sama disajikan laptop stage lewat WiFi.
 * Pengganti `window.tetra`: keadaan TV di-poll dari `/api/tv`, foto dari `/api/file` (sudah diperkecil laptop).
 * LUT tidak ikut (disimpan di laptop); warna preset tetap lewat filter CSS dari keadaan TV.
 */
const POLL_MS = 2000;
const getState = async (): Promise<StageTvState | null> => {
  const r = await fetch("/api/tv", { cache: "no-store" }).catch(() => null);
  const st = r?.ok ? ((await r.json()) as StageTvState | null) : null;
  return st && { ...st, lut: null };
};

const platform = {
  storage: {
    readFile: async (path: string) => {
      const r = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
      if (!r.ok) throw new Error(`foto ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    },
  },
  stage: {
    tv: {
      last: getState,
      onState: (cb: (s: StageTvState) => void) => {
        const id = setInterval(() => void getState().then((s) => s && cb(s)), POLL_MS);
        return () => clearInterval(id);
      },
    },
  },
} as unknown as BoothPlatform;

export function LanTv() {
  return (
    <PlatformProvider platform={platform}>
      <StageTv />
    </PlatformProvider>
  );
}
