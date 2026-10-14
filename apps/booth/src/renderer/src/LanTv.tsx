import {
  type BoothPlatform,
  PlatformProvider,
  StageHelper,
  StageTv,
  type StageTvState,
} from "@tetra/booth-core";
import { FullscreenButton } from "@tetra/ui";
import { useEffect } from "react";

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
  // Layar galeri (#281, `#display=<kode>`) memuat halaman ini di iframe: Ctrl+Shift+M diteruskan ke aplikasinya.
  useEffect(() => {
    if (!location.hash.startsWith("#display=") || window.parent === window) return;
    const on = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey || e.key.toLowerCase() !== "m") return;
      e.preventDefault();
      window.parent.postMessage("tetra-crew", "*");
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  // HP helper crew (#206): `#helper=<kode>` dari QR "HP crew" di laptop.
  const key = /^#helper=(\d{4})$/.exec(location.hash)?.[1];
  if (key) return <StageHelper helperKey={key} />;
  // Layar staf (laptop/TV milik crew): `#display=<kode>` → cetak dari galeri. Tamu (tanpa kode) tidak bisa mencetak.
  const display = /^#display=(\d{4})$/.exec(location.hash)?.[1];
  const print = async (id: string, path: string, choice: string) => {
    const r = await fetch("/api/helper", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: display, kind: "print", id, path, choice }),
    });
    if (!r.ok) throw new Error(`cetak ${r.status}`);
  };
  return (
    <PlatformProvider platform={platform}>
      <StageTv {...(display && { onPrint: print })} />
      <FullscreenButton />
    </PlatformProvider>
  );
}
