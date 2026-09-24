"use client";
import { useState } from "react";
import { copy } from "@/lib/copy";
import type { GuestAsset } from "@/lib/guest";

const t = copy.guest;

/** Simpan lewat share sheet (masuk galeri HP); fallback unduh; tanpa CORS → buka gambarnya di tab baru. */
async function save(assets: GuestAsset[], sessionId: string) {
  let files: File[];
  try {
    files = await Promise.all(
      assets.map(async (a) => {
        const res = await fetch(a.url);
        if (!res.ok) throw new Error(String(res.status));
        return new File([await res.blob()], `tetra-${sessionId}-${a.kind}-${a.idx}.jpg`, {
          type: "image/jpeg",
        });
      }),
    );
  } catch {
    window.open(assets[0]?.url, "_blank");
    return;
  }
  if (navigator.canShare?.({ files })) {
    await navigator.share({ files }).catch(() => {});
    return;
  }
  for (const f of files) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }
}

export function GuestReady({
  sessionId,
  assets,
  expiresAt,
}: {
  sessionId: string;
  assets: GuestAsset[];
  expiresAt: string | null;
}) {
  const [tab, setTab] = useState<"strip" | "original">("strip");
  const [busy, setBusy] = useState(false);
  const strip = assets.find((a) => a.kind === "strip_web");
  const originals = assets.filter((a) => a.kind === "original");
  const run = (list: GuestAsset[]) => async () => {
    setBusy(true);
    await save(list, sessionId);
    setBusy(false);
  };
  const tabClass = (on: boolean) =>
    `flex h-10 flex-1 items-center justify-center text-[13px] ${on ? "bg-lavender font-bold" : "font-semibold"}`;

  return (
    <>
      <div
        className="mx-5 flex overflow-hidden rounded-xl border-[1.5px] border-ink bg-white"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "strip"}
          className={tabClass(tab === "strip")}
          onClick={() => setTab("strip")}
        >
          {t.strip}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "original"}
          className={`${tabClass(tab === "original")} border-l-[1.5px] border-ink`}
          onClick={() => setTab("original")}
        >
          {t.original}
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center px-5 pt-5 pb-6">
        {tab === "strip" && strip && (
          <img
            src={strip.url}
            alt=""
            fetchPriority="high"
            className="layered max-h-[62vh] max-w-[66%] rounded-lg border-[1.5px] border-ink bg-white [--lb:1.5px] [--lx:5px] [--under:#fff]"
          />
        )}
        {tab === "original" && (
          <div className="grid w-full grid-cols-2 gap-3">
            {originals.map((o) => (
              <button
                key={o.idx}
                type="button"
                aria-label={`${t.original} ${o.idx}`}
                onClick={run([o])}
                className="pressable overflow-hidden rounded-lg border-[1.5px] border-ink bg-white"
              >
                <img
                  src={o.url}
                  alt=""
                  loading="lazy"
                  className="aspect-[3/2] w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <footer className="sticky bottom-0 flex flex-col gap-2.5 border-t-[1.5px] border-dashed border-ink bg-paper px-5 pt-3.5 pb-6">
        <div className="grid grid-cols-[1fr_1.5fr] gap-2.5">
          <button
            type="button"
            disabled={busy || !originals.length}
            onClick={run(originals)}
            className="pressable h-[52px] rounded-[14px] border-[1.5px] border-ink bg-white px-2 text-[13px] leading-tight font-bold disabled:opacity-40"
          >
            {t.saveAll}
          </button>
          <button
            type="button"
            disabled={busy || !strip}
            onClick={run(strip ? [strip] : [])}
            className="pressable layered h-[52px] rounded-[14px] border-[1.5px] border-ink bg-butter text-[15px] font-extrabold [--lb:1.5px] [--lx:4px] disabled:opacity-40"
          >
            {busy ? t.saving : t.saveStrip}
          </button>
        </div>
        <div className="flex justify-between text-[11px] text-text-2">
          {expiresAt ? (
            <span>
              {t.availableUntil}{" "}
              <span className="font-mono" data-expires>
                {expiresAt}
              </span>
            </span>
          ) : (
            <span />
          )}
          <span>{t.poweredBy}</span>
        </div>
      </footer>
    </>
  );
}
