import type { CloudSettings as Cloud, CloudSettingsPatch } from "@tetra/shared";
import { Button, ColorPicker } from "@tetra/ui";
import { useCallback, useEffect, useState } from "react";
import { copy } from "../copy";
import { crewText } from "../errors";
import type { BoothEvent } from "../event";
import { usePlatform } from "../PlatformContext";
import { btn, Panel, Row, ToggleRow } from "./parts";

type Flag = "clientLink" | "liveLink" | "guestCam" | "leadCapture" | "promoCard";
/** Link yang dimatikan langsung berhenti jalan untuk yang sudah menerimanya: ketuk dua kali. */
const LINKS: Flag[] = ["clientLink", "liveLink", "guestCam"];
const PAPER = "#f8f7f4";

const input =
  "h-16 w-full rounded-[16px] border-[2.5px] border-ink bg-white px-5 text-xl font-semibold text-ink outline-none placeholder:text-muted focus:shadow-[0_0_0_3px_var(--mint)]";

/**
 * Backstage tahap 2 (#295): setelan cloud event — link galeri klien & live, Guest Cam, lead capture, kartu promo,
 * branding halaman tamu. Tersimpan di cloud (semua booth event ini + halaman tamu), jadi butuh internet. Sakelar
 * langsung tersimpan; teks & warna lewat tombol Simpan. Harga & mode tetap di admin.
 */
export function CloudSettings({
  event,
  guestBaseUrl,
  onNote,
  onSaved,
}: {
  event: BoothEvent;
  guestBaseUrl: string;
  onNote: (m: string) => void;
  /** Muat ulang event aktif (tagline / QR Guest Cam dari bundle baru). */
  onSaved: () => Promise<void>;
}) {
  const p = usePlatform();
  const c = copy.crew.cloud;
  const [now, setNow] = useState<Cloud>();
  const [failed, setFailed] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Flag | null>(null);
  const [text, setText] = useState({ tagline: "", clientName: "", instagram: "", color: PAPER });

  const show = useCallback((s: Cloud) => {
    setNow(s);
    setText({
      tagline: s.tagline,
      clientName: s.clientName,
      instagram: s.clientInstagram.map((x) => `@${x}`).join(" "),
      color: s.guestColor ?? PAPER,
    });
  }, []);
  const load = useCallback(() => {
    setFailed(undefined);
    p.crew.cloudSettings(event.id, null).then(show, (e: unknown) => setFailed(crewText(e)));
  }, [p, event.id, show]);
  useEffect(load, [load]);

  const save = (patch: CloudSettingsPatch, key: string, done: string) => {
    setBusy(key);
    setConfirm(null);
    p.crew
      .cloudSettings(event.id, patch)
      .then(async (s) => {
        show(s);
        await onSaved();
        onNote(done);
      })
      .catch((e: unknown) => {
        onNote(crewText(e));
        load();
      })
      .finally(() => setBusy(null));
  };

  const instagram = text.instagram
    .split(/[\s,]+/)
    .map((x) => x.replace(/^@/, ""))
    .filter(Boolean);
  const textChanged =
    !!now &&
    (text.tagline.trim() !== now.tagline ||
      text.clientName.trim() !== now.clientName ||
      instagram.join(" ") !== now.clientInstagram.join(" ") ||
      text.color.toLowerCase() !== (now.guestColor ?? PAPER).toLowerCase());

  const url = (path: string) => `${guestBaseUrl.replace(/^https?:\/\//, "")}${path}`;
  const flagHint = (k: Flag, s: Cloud) =>
    k === "clientLink"
      ? url(`/g/${s.slug}`)
      : k === "liveLink"
        ? url(`/live/${s.slug}`)
        : k === "guestCam"
          ? s.guestPath
            ? url(s.guestPath)
            : c.flags.guestCam.hint
          : k === "leadCapture" && !s.leadReady
            ? c.leadNotReady
            : c.flags[k].hint;

  return (
    <Panel title={c.title} hint={c.note} testId="cloud-settings">
      {!now ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-lg font-medium text-text-2">{failed ?? c.loading}</p>
          {failed && (
            <Button variant="secondary" className={btn} onClick={load}>
              {c.retry}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {(Object.keys(c.flags) as Flag[]).map((k) => {
              const on = now[k];
              const asking = confirm === k;
              return (
                <ToggleRow
                  key={k}
                  testId={`cloud-${k}`}
                  label={c.flags[k].title}
                  hint={
                    asking ? (
                      <span className="font-bold text-ink">{c.confirmOff}</span>
                    ) : (
                      flagHint(k, now)
                    )
                  }
                  on={on}
                  onLabel={asking ? c.offNow : copy.crew.on}
                  offLabel={copy.crew.off}
                  disabled={busy !== null || (k === "leadCapture" && !on && !now.leadReady)}
                  onClick={() => {
                    if (on && LINKS.includes(k) && !asking) return setConfirm(k);
                    save(
                      { [k]: !on },
                      k,
                      on ? c.savedOff(c.flags[k].title) : c.savedOn(c.flags[k].title),
                    );
                  }}
                />
              );
            })}
          </div>

          <div className="flex flex-col gap-4 border-t-[2.5px] border-ink pt-5">
            <h3 className="text-[22px] font-extrabold tracking-[-0.01em]">{c.brandTitle}</h3>
            <label className="flex flex-col gap-2 text-lg font-bold">
              {c.tagline}
              <input
                className={input}
                maxLength={40}
                placeholder="The Wedding of"
                value={text.tagline}
                onChange={(e) => setText((t) => ({ ...t, tagline: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-2 text-lg font-bold">
              {c.clientName}
              <input
                className={input}
                maxLength={120}
                value={text.clientName}
                onChange={(e) => setText((t) => ({ ...t, clientName: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-2 text-lg font-bold">
              {c.instagram}
              <input
                className={input}
                maxLength={400}
                placeholder="@akun.klien @akun.wo"
                value={text.instagram}
                onChange={(e) => setText((t) => ({ ...t, instagram: e.target.value }))}
              />
            </label>
            <Row label={c.color} hint={c.colorHint}>
              <ColorPicker
                label={c.color}
                value={text.color}
                onChange={(color) => setText((t) => ({ ...t, color }))}
                showHex
              />
            </Row>
          </div>
          <div className="flex justify-end">
            <Button
              className={`${btn} px-12`}
              disabled={busy !== null || !textChanged || instagram.length > 6}
              onClick={() =>
                save(
                  {
                    tagline: text.tagline.trim(),
                    clientName: text.clientName.trim(),
                    clientInstagram: instagram,
                    guestColor: text.color.toLowerCase() === PAPER ? null : text.color,
                  },
                  "text",
                  c.brandSaved,
                )
              }
            >
              {copy.crew.save}
            </Button>
          </div>
        </>
      )}
    </Panel>
  );
}
