"use client";
import { MessageCircle } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { setLink } from "./links";

/**
 * Link galeri klien & slideshow (bagian "Galeri klien" E3): `/g/<slug>` dan `/live/<slug>` (nama event, #147).
 * Buat Link = aktifkan, Cabut = matikan (link slug & token lama tidak bisa dibuka; ketuk dua kali).
 * Ringkasan event juga memberi `waText` (Kirim ke WA, owner sendiri yang menekan kirim) dan `clientSeen`.
 */
export function LinksPanel({
  eventId,
  origin,
  slug,
  clientOn,
  liveOn,
  waText,
  clientSeen,
}: {
  eventId: string;
  origin: string;
  slug: string;
  clientOn?: boolean;
  liveOn?: boolean;
  waText?: string;
  clientSeen?: string;
}) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);
  // Cabut butuh ketukan kedua (link yang sudah dibagikan langsung mati); lepas sendiri setelah 4 dtk.
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  const row = (kind: "client" | "live", label: string, path: string, on: boolean) => {
    const url = on ? `${origin}/${path}/${slug}` : null;
    const run = (a: "new" | "revoke") => () => {
      if (a === "revoke" && armed !== kind) return setArmed(kind);
      setArmed(null);
      start(async () => {
        await setLink(eventId, kind, a);
      });
    };
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold">{label}</span>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex h-[42px] min-w-0 flex-1 items-center justify-between gap-2 rounded-[11px] border-[1.5px] border-ink bg-white px-3 font-mono text-[13px]"
            data-testid={`link-${kind}`}
          >
            <span className={`min-w-0 flex-1 truncate ${url ? "" : "font-sans text-text-2"}`}>
              {url ?? "Link belum aktif"}
            </span>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="font-sans text-xs font-bold underline"
              >
                Buka
              </a>
            )}
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
          {on && kind === "client" && waText && (
            <a
              href={`https://wa.me/?text=${encodeURIComponent(waText)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-[42px] items-center gap-1.5 rounded-[11px] border-[1.5px] border-ink bg-mint-soft px-3 text-xs font-bold no-underline"
            >
              <MessageCircle aria-hidden className="size-4" strokeWidth={2} />
              Kirim ke WA
            </a>
          )}
          {on && (
            <button
              type="button"
              disabled={pending}
              onClick={run("revoke")}
              className={`h-[42px] rounded-[11px] border-[1.5px] border-ink px-3 text-xs font-bold ${armed === kind ? "bg-coral-strong" : "bg-coral"}`}
            >
              {armed === kind ? "Yakin cabut?" : "Cabut"}
            </button>
          )}
        </div>
        {on && kind === "client" && clientSeen && (
          <span className="text-xs text-text-2" data-testid="client-seen">
            {clientSeen}
          </span>
        )}
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-4">
      {row("client", "Galeri klien", "g", !!clientOn)}
      {row("live", "Live slideshow", "live", !!liveOn)}
      {liveOn && (
        <p
          className="-mt-2 flex flex-wrap items-center gap-x-2 text-xs text-text-2"
          data-testid="link-stage"
        >
          Layar Photo Stage untuk device kedua (laptop / tablet / smart TV):
          <span className="font-mono text-ink">{`${origin}/stage/${slug}`}</span>
          <button
            type="button"
            className="font-bold text-ink underline"
            onClick={async () => {
              await navigator.clipboard.writeText(`${origin}/stage/${slug}`).catch(() => {});
              setCopied("stage");
            }}
          >
            {copied === "stage" ? "Tersalin" : "Salin"}
          </button>
        </p>
      )}
      <p className="text-xs text-text-2">
        Link memakai nama event. Ganti nama atau tanggal event = alamat link ikut berubah.
      </p>
    </div>
  );
}
