"use client";
import { QrCode } from "@tetra/ui";
import { useRef, useState, useTransition } from "react";
import { setLink } from "./links";

/**
 * Link & QR Guest Cam (desain E14, #197/#203): QR asli, salin, cabut & buat ulang (token baru → QR & kartu lama
 * mati), kartu QR meja A6 (wedding/corporate), dan QR PNG.
 */
export function GuestLinkPanel({
  eventId,
  origin,
  token,
}: {
  eventId: string;
  origin: string;
  token: string | null;
}) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const qr = useRef<HTMLDivElement>(null);
  const url = token ? `${origin}/c/${token}` : null;
  const btn =
    "flex h-[42px] items-center rounded-[11px] border-[1.5px] border-ink px-3.5 text-[13px] font-bold whitespace-nowrap no-underline";

  const png = async () => {
    const svg = qr.current?.querySelector("svg");
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg).replaceAll("var(--ink)", "#1D1D1B");
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = c.height = 1200;
    const g = c.getContext("2d");
    if (!g) return;
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, 1200, 1200);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = "qr-guest-cam.png";
    a.click();
  };

  return (
    <div className="flex flex-col gap-4 rounded-[18px] border-[1.5px] border-ink bg-paper p-5 md:flex-row md:items-start md:gap-5">
      <div
        ref={qr}
        className="flex size-[132px] flex-none items-center justify-center rounded-[14px] border-[1.5px] border-ink bg-white p-2.5"
      >
        {url ? (
          <QrCode url={url} size={110} />
        ) : (
          <span className="text-center text-xs text-text-2">Link belum aktif</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <span className="text-sm font-extrabold">Link &amp; QR Guest Cam</span>
        <div className="flex flex-wrap gap-2.5">
          <div
            data-testid="link-guest"
            className="flex h-[42px] min-w-0 flex-1 items-center justify-between gap-2 rounded-[11px] border-[1.5px] border-ink bg-white px-3 font-mono text-[13px]"
          >
            <span className={`truncate ${url ? "" : "font-sans text-text-2"}`}>
              {url ?? "Link belum aktif"}
            </span>
            {url && (
              <button
                type="button"
                className="font-sans text-xs font-bold underline"
                onClick={async () => {
                  await navigator.clipboard.writeText(url).catch(() => {});
                  setCopied(true);
                }}
              >
                {copied ? "Tersalin" : "Salin"}
              </button>
            )}
          </div>
          {url ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  if (
                    !confirm(
                      "Cabut link ini dan buat yang baru? QR dan kartu yang sudah dicetak berhenti bekerja.",
                    )
                  )
                    return;
                  await setLink(eventId, "guest", "new");
                  setCopied(false);
                })
              }
              className={`${btn} bg-coral`}
            >
              Cabut &amp; buat ulang
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(() => setLink(eventId, "guest", "new"))}
              className={`${btn} bg-butter`}
            >
              Buat Link
            </button>
          )}
        </div>
        {url && (
          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={`/admin/events/${eventId}/guest-card?size=a5`}
              target="_blank"
              rel="noreferrer"
              className={`${btn} layered bg-white [--lb:1.5px] [--lx:4px]`}
            >
              Kartu QR meja · A5 / A6
            </a>
            <a
              href={`/admin/events/${eventId}/business-card`}
              target="_blank"
              rel="noreferrer"
              className={`${btn} layered bg-white [--lb:1.5px] [--lx:4px]`}
            >
              Kartu nama QR · 90×55 mm
            </a>
            <button type="button" onClick={() => void png()} className={`${btn} bg-white`}>
              Unduh QR · PNG
            </button>
          </div>
        )}
        <p className="text-xs leading-normal text-text-2">
          Cabut = link dan QR lama berhenti bekerja, termasuk kartu yang sudah dicetak. Link galeri
          klien dan live tidak ikut berubah.
        </p>
      </div>
    </div>
  );
}
