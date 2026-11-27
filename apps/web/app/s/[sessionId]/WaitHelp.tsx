"use client";
import { useEffect, useState } from "react";
import { waLink } from "@/lib/contact";
import { copy } from "@/lib/copy";

const t = copy.guest;
const HELP_MIN = 10;
const STOP_MIN = 30;

/**
 * Foto belum sampai (audit 27 Nov): dulu tamu menunggu "belum sampai" selamanya tanpa jalan keluar. Waktu tunggu
 * dihitung sejak link ini pertama dibuka di HP ini (localStorage); setelah 10 menit muncul bantuan, setelah 30 menit
 * pemeriksaan otomatis berhenti (AutoRefresh) dan ada tombol muat ulang.
 */
export function WaitHelp({ sessionId }: { sessionId: string }) {
  const [min, setMin] = useState(0);
  useEffect(() => {
    const k = `tetra:wait:${sessionId}`;
    const first = Number(localStorage.getItem(k)) || Date.now();
    localStorage.setItem(k, String(first));
    const tick = () => setMin((Date.now() - first) / 60_000);
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [sessionId]);
  if (min < HELP_MIN) return null;
  return (
    <section
      data-testid="wait-help"
      className="flex flex-col gap-3 rounded-[18px] border-[1.5px] border-ink bg-peach p-[18px]"
    >
      <h2 className="text-lg font-extrabold tracking-[-0.02em]">{t.stuckTitle}</h2>
      <p className="text-sm leading-[1.55] text-pretty">{t.stuckBody(sessionId)}</p>
      <a
        href={waLink(t.helpText(location.href))}
        target="_blank"
        rel="noopener"
        className="pressable flex h-12 items-center justify-center rounded-xl border-[1.5px] border-ink bg-white text-sm font-bold no-underline"
      >
        {t.help}
      </a>
      {min >= STOP_MIN && (
        <button
          type="button"
          onClick={() => location.reload()}
          className="pressable flex h-11 items-center justify-center rounded-xl border-[1.5px] border-dashed border-ink text-sm font-bold"
        >
          {t.reload}
        </button>
      )}
    </section>
  );
}
