import { type LayoutSpec, newSessionId, printPaper } from "@tetra/shared";
import { browserContext, type CanvasLike, toSheet } from "@tetra/template-engine";
import { useEffect, useState } from "react";
import { copy } from "./copy";
import type { BoothEvent } from "./event";
import { usePlatform } from "./PlatformContext";
import type { BoothPlatform, LocalGuestPrint } from "./platform";
import { toneForPrint } from "./printTone";

const POLL_MS = 5_000;

/**
 * Satu lembar cetak tamu Guest Cam (#223): frame tamu (strip_web, ukuran asli potong) disusun lewat `toSheet`
 * template engine yang sama (aturan 2); kertas setengah lembar berisi dua tamu (atau satu tamu dua kali), lalu
 * koreksi warna printer (#208) dan antrean printer yang sama dengan sesi.
 */
export async function printGuestSheet(p: BoothPlatform, jobs: LocalGuestPrint[]) {
  const [first, second] = jobs;
  if (!first) return;
  const bitmaps = await Promise.all(jobs.map((j) => createImageBitmap(new Blob([j.bytes]))));
  try {
    const ctx = browserContext("Geist Variable");
    const sheet = toSheet(
      first.layout as LayoutSpec,
      bitmaps[0] as unknown as CanvasLike,
      ctx,
      second ? (bitmaps[1] as unknown as CanvasLike) : undefined,
    ) as unknown as OffscreenCanvas;
    const blob = await toneForPrint(sheet).convertToBlob({ type: "image/jpeg", quality: 0.95 });
    const id = newSessionId();
    const path = `${await p.storage.sessionDir(id)}/out/guest-print.jpg`;
    await p.storage.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    await p.printer.submit({
      jobId: `guest-${id}`,
      path,
      copies: 1,
      paper: printPaper((first.layout as LayoutSpec).paper),
    });
  } finally {
    for (const b of bitmaps) b.close();
  }
}

/**
 * Pencetak tamu Guest Cam (#223): selama event dengan add-on cetak aktif, tiap 5 dtk ambil job untuk kertas event
 * ini, cetak, laporkan. Offline = diam (booth tidak pernah menunggu jaringan). Chip kecil memberi tahu crew nomor
 * & nama tamu yang mengambil cetakan.
 */
export function GuestPrinter({ event }: { event: BoothEvent }) {
  const p = usePlatform();
  const [last, setLast] = useState<string | null>(null);
  const on = !!p.guestPrints && event.settings.guestCam.print && event.id !== "local";
  useEffect(() => {
    const gp = p.guestPrints;
    if (!on || !gp) return;
    let stop = false;
    let busy = false;
    const tick = async () => {
      if (busy || stop) return;
      busy = true;
      try {
        const jobs = await gp.claim(event.id, event.layout.paper);
        if (!jobs.length) return;
        const label = jobs.map((j) => copy.guestPrint.who(j.number, j.guestName)).join(" · ");
        setLast(label);
        try {
          await printGuestSheet(p, jobs);
          await Promise.all(jobs.map((j) => gp.report(j.id, "printed")));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(`[guest-print] gagal: ${msg}`);
          await Promise.all(jobs.map((j) => gp.report(j.id, "failed", msg.slice(0, 300))));
        }
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void tick(), POLL_MS);
    void tick();
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [p, on, event.id, event.layout.paper]);
  useEffect(() => {
    if (!last) return;
    const t = setTimeout(() => setLast(null), 12_000);
    return () => clearTimeout(t);
  }, [last]);
  if (!last) return null;
  return (
    <p
      role="status"
      data-testid="guest-print-chip"
      className="absolute right-6 bottom-5 flex items-center gap-2.5 rounded-full border-2 border-ink bg-butter px-4 py-1.5 text-xl font-semibold"
    >
      {copy.guestPrint.printing(last)}
    </p>
  );
}
