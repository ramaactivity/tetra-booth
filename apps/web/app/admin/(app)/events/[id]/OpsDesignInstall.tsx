"use client";
import { type LayoutPaper, PAPER_CANVAS } from "@tetra/shared";
import { ImageDown, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import { type Design, UploadDesign } from "../../templates/UploadDesign";
import { installOpsDesign } from "./ops-design";

const t = copy.admin.opsDesign;
const btn =
  "pressable inline-flex h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-ink px-4 text-sm font-extrabold";
const TITLE: Record<LayoutPaper, string> = {
  "2x6x2": "Strip 2R",
  "4R": "Foto 4R",
  "3x4x2": "Polaroid",
};

/**
 * Kartu + dialog "Pasang desain dari Tetra Ops" (#177): PNG ACC dimuat dari server, diolah UploadDesign yang sama
 * dengan wizard Template (skala, deteksi kotak foto, hapus warna penanda), admin memeriksa, lalu satu klik pasang.
 */
export function OpsDesignInstall({
  eventId,
  paper,
  orient,
  installed,
}: {
  eventId: string;
  paper: LayoutPaper;
  orient: "portrait" | "landscape";
  /** Desain ACC ini sudah pernah dipasang. */
  installed: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [design, setDesign] = useState<Design | null>(null);
  const [loadError, setLoadError] = useState("");
  const [result, action, pending] = useActionState(installOpsDesign.bind(null, eventId), null);
  const c = PAPER_CANVAS[paper];
  const [W, H] = orient === "landscape" ? [c.height, c.width] : [c.width, c.height];

  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
    if (!open && d?.open) d.close();
  }, [open]);
  useEffect(() => {
    if (!open || design) return;
    let live = true;
    setLoadError("");
    fetch(`/api/admin/events/${eventId}/ops-design`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then(
        (b) =>
          live &&
          setDesign({
            file: new File([b], "desain-tetra-ops.png", { type: "image/png" }),
            fit: false,
          }),
      )
      .catch(() => live && setLoadError(t.loadError));
    return () => {
      live = false;
    };
  }, [open, design, eventId]);
  useEffect(() => {
    if (result?.ok) setOpen(false);
  }, [result]);

  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border-[1.5px] border-ink bg-mint-soft px-4 py-3">
      <p className="text-[13px] font-semibold">
        {result?.ok ? result.message : installed ? t.installed : t.ready}
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${btn} bg-white hover:bg-paper`}
      >
        <ImageDown aria-hidden className="size-4" strokeWidth={2} />
        {installed || result?.ok ? t.reinstall : t.install}
      </button>
      <dialog
        ref={ref}
        aria-label={t.install}
        onClose={() => setOpen(false)}
        className="m-auto w-[720px] max-w-[calc(100vw-32px)] rounded-[22px] border-[1.5px] border-ink bg-white p-0 backdrop:bg-ink/40"
      >
        <form
          action={(fd) => {
            const out = design?.out;
            if (out?.file) {
              fd.set("ov", out.file);
              fd.set("slots", JSON.stringify(out.slots));
            }
            action(fd);
          }}
          className="flex max-h-[min(760px,calc(100dvh-48px))] flex-col"
        >
          <input type="hidden" name="paper" value={paper} />
          <input type="hidden" name="orient" value={orient} />
          <header className="flex items-start justify-between gap-4 border-b-[1.5px] border-dashed border-line-soft px-6 pt-5 pb-4">
            <div>
              <h2 className="text-lg font-extrabold">{t.install}</h2>
              <p className="mt-1 text-[13px] text-text-2">
                {TITLE[paper]} {orient} · {t.hint}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={t.close}>
              <X aria-hidden className="size-5" strokeWidth={2} />
            </button>
          </header>
          <div className="overflow-y-auto px-6 py-5">
            {loadError ? (
              <p className="rounded-xl border-[1.5px] border-ink bg-coral px-4 py-3 text-sm font-semibold">
                {loadError}
              </p>
            ) : design ? (
              <UploadDesign
                W={W}
                H={H}
                paperText={`${TITLE[paper]} ${orient}`}
                design={design}
                setDesign={setDesign}
                onPick={() => {}}
                match={() => undefined}
              />
            ) : (
              <p className="text-sm text-text-2">{t.loading}</p>
            )}
            {result && !result.ok && (
              <p className="mt-4 text-sm font-semibold text-coral-strong">{result.message}</p>
            )}
          </div>
          <footer className="flex justify-end gap-2 border-t-[1.5px] border-dashed border-line-soft px-6 py-4">
            <button type="button" onClick={() => setOpen(false)} className={`${btn} bg-white`}>
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={pending || !design?.out?.file}
              className={`${btn} layered bg-butter [--lb:1.5px] [--lx:4px] disabled:opacity-50`}
            >
              {pending ? t.saving : t.confirm}
            </button>
          </footer>
        </form>
      </dialog>
    </div>
  );
}
