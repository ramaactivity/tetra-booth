"use client";
import { useState, useTransition } from "react";
import { setLink } from "./links";

/**
 * Link galeri klien & slideshow (bagian "Galeri klien" E3): `/g/<slug>` dan `/live/<slug>` (nama event, #147).
 * Buat Link = aktifkan, Cabut = matikan (link slug & token lama tidak bisa dibuka).
 */
export function LinksPanel({
  eventId,
  origin,
  slug,
  clientOn,
  liveOn,
  guestOn,
}: {
  eventId: string;
  origin: string;
  slug: string;
  clientOn?: boolean;
  liveOn?: boolean;
  /** Guest Cam (#197): diisi = hanya baris link /c (section Guest Cam). */
  guestOn?: boolean;
}) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);
  const row = (kind: "client" | "live" | "guest", label: string, path: string, on: boolean) => {
    const url = on ? `${origin}/${path}/${slug}` : null;
    const run = (a: "new" | "revoke") => () =>
      start(async () => {
        if (a === "revoke" && !confirm(`Cabut ${label}? Link ini langsung tidak bisa dibuka.`))
          return;
        await setLink(eventId, kind, a);
      });
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold">{label}</span>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex h-[42px] min-w-0 flex-1 items-center justify-between gap-2 rounded-[11px] border-[1.5px] border-ink bg-white px-3 font-mono text-[13px]"
            data-testid={`link-${kind}`}
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
                  setCopied(kind);
                }}
              >
                {copied === kind ? "Tersalin" : "Salin"}
              </button>
            )}
          </div>
          {!on && (
            <button
              type="button"
              disabled={pending}
              onClick={run("new")}
              className="h-[42px] rounded-[11px] border-[1.5px] border-ink bg-butter px-3 text-xs font-bold"
            >
              Buat Link
            </button>
          )}
          {on && (
            <button
              type="button"
              disabled={pending}
              onClick={run("revoke")}
              className="h-[42px] rounded-[11px] border-[1.5px] border-ink bg-coral px-3 text-xs font-bold"
            >
              Cabut
            </button>
          )}
        </div>
      </div>
    );
  };
  if (guestOn !== undefined)
    return (
      <div className="flex flex-col gap-3">
        {row("guest", "Link Guest Cam (isi QR)", "c", guestOn)}
      </div>
    );
  return (
    <div className="flex flex-col gap-4">
      {row("client", "Galeri klien", "g", !!clientOn)}
      {row("live", "Live slideshow", "live", !!liveOn)}
      <p className="text-xs text-text-2">
        Link memakai nama event. Ganti nama atau tanggal event = alamat link ikut berubah.
      </p>
    </div>
  );
}
