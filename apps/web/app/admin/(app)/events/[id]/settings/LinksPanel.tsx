"use client";
import { useState, useTransition } from "react";
import { setLink } from "./links";

/** Link galeri klien & slideshow (bagian "Galeri klien" E3): salin, buat ulang, cabut. */
export function LinksPanel({
  eventId,
  origin,
  clientToken,
  liveToken,
}: {
  eventId: string;
  origin: string;
  clientToken: string | null;
  liveToken: string | null;
}) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);
  const row = (kind: "client" | "live", label: string, path: string, token: string | null) => {
    const url = token ? `${origin}/${path}/${token}` : null;
    const run = (a: "new" | "revoke") => () =>
      start(async () => {
        if (
          a === "new" &&
          token &&
          !confirm(`Buat ulang ${label}? Link lama langsung tidak bisa dibuka.`)
        )
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
            <span className="truncate">{url ?? "Belum ada link"}</span>
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
          <button
            type="button"
            disabled={pending}
            onClick={run("new")}
            className="h-[42px] rounded-[11px] border-[1.5px] border-ink bg-white px-3 text-xs font-bold"
          >
            {token ? "Cabut & Buat Ulang" : "Buat Link"}
          </button>
          {token && (
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
  return (
    <div className="flex flex-col gap-4">
      {row("client", "Galeri klien", "g", clientToken)}
      {row("live", "Live slideshow", "live", liveToken)}
    </div>
  );
}
