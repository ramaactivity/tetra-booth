import { Button } from "@tetra/ui";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { copy } from "../copy";

/** QR ke halaman tamu. Langsung muncul walau offline (FSD §1.11). */
export function Qr({ url, onDone }: { url: string; onDone: () => void }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 0, width: 640, color: { dark: "#1a1714", light: "#ffffff" } })
      .then(setSrc)
      .catch((e: unknown) => console.error("[qr] gagal membuat QR", e));
  }, [url]);
  return (
    <main className="flex h-full w-full flex-col items-center justify-center gap-12 bg-bg p-16 text-fg">
      <div className="rounded bg-surface p-10">
        {src && <img src={src} alt={url} className="size-[min(40vh,420px)]" />}
      </div>
      <h1 className="text-4xl font-medium tracking-tight">{copy.qr.title}</h1>
      <Button size="booth" variant="secondary" onClick={onDone}>
        {copy.qr.done}
      </Button>
    </main>
  );
}
