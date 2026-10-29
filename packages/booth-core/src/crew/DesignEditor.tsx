import { GEIST, samplePhoto, TemplateEditor, VARS } from "@tetra/editor";
import { type EventBundle, type LayoutSpec, newSessionId, printPaper } from "@tetra/shared";
import { browserContext, type ImageLike, render } from "@tetra/template-engine";
import { Printer } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { copy } from "../copy";
import { type DesignEntry, type EditorOpen, fromEditor, toEditor } from "../designEdit";
import { crewText } from "../errors";
import { usePlatform } from "../PlatformContext";
import type { BoothPlatform, DesignFile } from "../platform";
import { toneForPrint } from "../printTone";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
};
const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

/**
 * Cetak desain yang sedang diedit (belum perlu disimpan) dengan foto contoh bernomor, lewat jalur cetak booth yang
 * sama dengan sesi (koreksi warna printer, printer lokal / printer bersama). File `test_*` di folder sesi sendiri.
 */
async function printDesign(
  p: BoothPlatform,
  layout: LayoutSpec,
  images: Record<string, ImageLike>,
  fontFamily: (id: string) => string,
) {
  const sheet = render(
    layout,
    {
      photos: layout.slots.map((s, i) =>
        samplePhoto(Math.max(1, Math.round(s.w)), Math.max(1, Math.round(s.h)), i),
      ),
      assets: images,
      vars: VARS,
    },
    { ...browserContext(GEIST), fontFamily },
  ) as unknown as OffscreenCanvas;
  const blob = await toneForPrint(sheet).convertToBlob({ type: "image/jpeg", quality: 0.95 });
  const id = newSessionId();
  const path = `${await p.storage.sessionDir(id)}/out/test_design.jpg`;
  await p.storage.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  await p.printer.submit({ jobId: `test-${id}`, path, copies: 1, paper: printPaper(layout.paper) });
}

function PrintButton(props: {
  layout: LayoutSpec;
  images: Record<string, ImageLike>;
  fontFamily: (id: string) => string;
}) {
  const p = usePlatform();
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [note, setNote] = useState<string>();
  const empty = !props.layout.slots.length;
  const print = async () => {
    setState("busy");
    setNote(undefined);
    try {
      await printDesign(p, props.layout, props.images, props.fontFamily);
      setState("sent");
      setTimeout(() => setState("idle"), 2500);
    } catch (e) {
      setState("idle");
      setNote(crewText(e));
    }
  };
  return (
    <>
      {note && (
        <span
          role="alert"
          className="max-w-[260px] truncate text-[12px] font-semibold text-coral-strong"
        >
          {note}
        </span>
      )}
      <button
        type="button"
        onClick={print}
        disabled={state === "busy" || empty}
        title={empty ? copy.crew.designNoSlot : undefined}
        className="flex h-9 items-center gap-1.5 rounded-[10px] border-[1.5px] border-ink bg-white px-3 text-[13px] font-bold disabled:opacity-50"
      >
        <Printer className="size-4" />
        {state === "busy"
          ? copy.crew.designPrinting
          : state === "sent"
            ? copy.crew.designPrinted
            : copy.crew.designPrint}
      </button>
    </>
  );
}

/**
 * Editor desain lengkap di booth (DECISIONS #128/#131): `@tetra/editor` yang sama dengan admin. Simpan = override
 * lokal per event (bukan ke cloud), dipakai sesi & cetak berikutnya; "Kembalikan ke cloud" di menu Event.
 * Dirender lewat portal di luar Stage: Stage memakai transform scale, editor butuh koordinat pointer layar asli.
 */
export function DesignEditor({
  bundle,
  design,
  savedAt,
  onBack,
}: {
  bundle: EventBundle;
  design: DesignEntry;
  savedAt?: string | undefined;
  /** `saved` = ada yang disimpan → host memuat ulang event. */
  onBack: (saved: boolean) => void;
}) {
  const p = usePlatform();
  const open = useMemo<EditorOpen>(
    () => toEditor(design.layout, bundle.assets),
    [design.layout, bundle.assets],
  );
  const [urls, setUrls] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string>();
  const saved = useRef(false);

  // Byte aset desain dari bundle lokal → blob URL untuk editor (offline).
  useEffect(() => {
    let live = true;
    const made: string[] = [];
    (async () => {
      const out: Record<string, string> = {};
      for (const [c, file] of Object.entries(open.files)) {
        if (c.startsWith("lib-")) continue; // font pustaka dimuat dari fontUrl
        const src = open.back[c] ?? c;
        const bytes = await p.events.asset(bundle.id, src);
        const u = URL.createObjectURL(new Blob([bytes], { type: MIME[extOf(file)] ?? "" }));
        made.push(u);
        out[c] = u;
      }
      if (live) setUrls(out);
    })().catch((e: unknown) => live && setError(crewText(e)));
    return () => {
      live = false;
      for (const u of made) URL.revokeObjectURL(u);
    };
  }, [p, bundle.id, open]);

  const body = error ? (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-2xl">
      <p role="alert">{error}</p>
      <button
        type="button"
        className="rounded-[16px] border-2 border-ink bg-white px-8 py-4 font-bold"
        onClick={() => onBack(false)}
      >
        {copy.photobox.back}
      </button>
    </div>
  ) : !urls ? (
    <p className="flex h-full items-center justify-center text-2xl text-text-2">
      {copy.crew.designLoading}
    </p>
  ) : (
    <TemplateEditor
      initial={open.layout}
      name={design.name}
      version={design.layout.version}
      savedAt={savedAt ?? new Date().toISOString()}
      files={open.files}
      presets={[]}
      assetUrl={(c) => urls[c] ?? ""}
      fontUrl={(f) => `fonts/${f.file}`}
      onSave={async ({ layout, pendingFiles }) => {
        const cap = Date.now().toString(36);
        const pending = Object.entries(pendingFiles).filter(
          (e): e is [string, File] => e[1] instanceof File,
        );
        const files: DesignFile[] = await Promise.all(
          pending.map(async ([c, f]) => ({
            assetId: `loc-${cap}-${c}`,
            ext: extOf(f.name),
            bytes: new Uint8Array(await f.arrayBuffer()),
          })),
        );
        const out = fromEditor(
          layout,
          open,
          design.layout.id,
          pending.map(([c]) => c),
          cap,
        );
        try {
          await p.crew.saveDesign(bundle.id, out, files);
          saved.current = true;
          return { ok: true, version: design.layout.version, message: copy.crew.designSaved };
        } catch (e) {
          return { ok: false, message: crewText(e) };
        }
      }}
      onSavePreset={async () => ({ ok: false, message: copy.crew.presetsAdminOnly })}
      onDeletePreset={async () => false}
      onBack={() => onBack(saved.current)}
      actions={(a) => <PrintButton {...a} />}
    />
  );
  return createPortal(
    <div
      data-testid="design-editor"
      className="fixed inset-0 z-[100] h-dvh overflow-hidden bg-paper"
    >
      {body}
    </div>,
    document.body,
  );
}
