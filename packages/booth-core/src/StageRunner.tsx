import {
  DEFAULT_STAGE_PRESET,
  newSessionId,
  PHOTO_FILTERS,
  STAGE_GAP,
  STAGE_MAX_SHOTS,
  type StagePreset,
  StagePresetSchema,
  stagePresetCss,
} from "@tetra/shared";
import { Check, EyeOff } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { renderEvent } from "./compose";
import { copy } from "./copy";
import { errText } from "./errors";
import type { BoothEvent } from "./event";
import { ORIGINAL_LONG_SIDE, THUMB_LONG_SIDE } from "./finalize";
import { lutKey, parseCube, storedLut } from "./lut";
import { usePlatform } from "./PlatformContext";
import type { SessionAsset, StageStatus } from "./platform";
import { StageColor } from "./StageColor";
import { StageSetup } from "./StageSetup";
import {
  activeGroup,
  groupLabel,
  groupNo,
  initialStage,
  STAGE_ARCH,
  STAGE_SERIF,
  type StageGroup,
  type StageShot,
  stagePrintLayout,
  stageReducer,
  tvState,
} from "./stage";
import { archImage, renderJpeg, stageCanvas } from "./stageImage";
import { QrCode } from "./ui";

const t = copy.stage;
// ponytail: preset & jeda disimpan per laptop (localStorage); pindah ke pengaturan event cloud di S4.
const presetKey = (eventId: string) => `tetra.stage.preset.${eventId}`;
const GAP_KEY = "tetra.stage.gap";
const loadPreset = (eventId: string): StagePreset => {
  try {
    return StagePresetSchema.parse(JSON.parse(localStorage.getItem(presetKey(eventId)) ?? "{}"));
  } catch {
    return DEFAULT_STAGE_PRESET;
  }
};
/** Pisah otomatis: setelan laptop ini, kalau belum pernah diatur = bawaan event dari admin (#192). */
const loadGap = (fallback: number): number | null => {
  const v = localStorage.getItem(GAP_KEY);
  if (v === "off") return null;
  const n = Number(v);
  return v !== null && n >= STAGE_GAP.min && n <= STAGE_GAP.max ? n : fallback;
};
const iso = (ms: number) => new Date(ms).toISOString();

type SaveState = "saving" | "saved" | "failed";
type PrintState = { st: "printing" | "done" | "failed"; n: number };
const hms = (ms: number) =>
  new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .format(ms)
    .replaceAll(":", ".");
const hm = (ms: number) =>
  new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(ms);

/** Keycap kecil (⏎ Enter, Spasi, Tab). */
const Key = ({ children, big }: { children: ReactNode; big?: boolean }) => (
  <span
    className={`rounded-[9px] border-2 border-b-4 border-ink bg-white px-3 py-0.5 font-mono font-medium ${big ? "text-xl" : "text-lg"}`}
  >
    {children}
  </span>
);

/**
 * Layar operator Photo Stage (#178, docs/PLAN-PHOTO-STAGE.md §5): jepretan rana fotografer masuk otomatis,
 * dikelompokkan per rombongan (`stageReducer`), rombongan yang ditutup diproses (warna preset, 2400 px + thumb)
 * lalu jadi sesi `source: stage` di antrean upload yang sama dengan booth. Tampilan final #186
 * (docs/design/photo-stage, A2–A3): status bar, banner masalah, kartu rombongan aktif, baki jeda, daftar, riwayat.
 */
export function StageRunner({
  event,
  guestBaseUrl,
  onCrew,
}: {
  event: BoothEvent;
  guestBaseUrl: string;
  onCrew: () => void;
}) {
  const p = usePlatform();
  const stage = p.stage;
  const [s, dispatch] = useReducer(stageReducer, null, () =>
    initialStage(loadGap(event.settings.stageGapSec)),
  );
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [saves, setSaves] = useState<Record<string, SaveState>>({});
  const [preset, setPreset] = useState(() => loadPreset(event.id));
  const [colorOpen, setColorOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const [prints, setPrints] = useState<Record<string, PrintState>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [openHist, setOpenHist] = useState<string | null>(null);
  const [sel, setSel] = useState<number[]>([]);
  const [status, setStatus] = useState<StageStatus | null | undefined>(undefined);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const say = useCallback((m: string) => {
    clearTimeout(toastTimer.current);
    setToast(m);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);
  const sRef = useRef(s);
  sRef.current = s;
  // Wizard persiapan (#188): sekali per event di laptop ini; jepretan selama wizard = foto tes.
  const readyKey = `tetra.stage.ready.${event.id}`;
  const [setupOpen, setSetupOpen] = useState(() => {
    try {
      return !localStorage.getItem(readyKey);
    } catch {
      return true;
    }
  });
  const setupRef = useRef(setupOpen);
  setupRef.current = setupOpen;
  const [testShot, setTestShot] = useState<StageShot>();
  const [tvTest, setTvTest] = useState(false);
  const presetRef = useRef(preset);
  presetRef.current = preset;
  const [lut, setLut] = useState(() => storedLut(lutKey(event.id)));
  const [lutError, setLutError] = useState<string | null>(null);
  const lutRef = useRef(lut);
  lutRef.current = lut;
  const started = useRef(new Map<string, Promise<void>>());
  const busy = useRef(new Set<string>());

  // Pratinjau 480 px dengan LUT (#184); filter preset dipasang lewat CSS supaya slider langsung terlihat.
  const makeThumb = useCallback(
    (path: string) =>
      void p.storage
        .readFile(path)
        .then((b) => renderJpeg(b, 480, "none", 0.8, lutRef.current?.lut ?? null))
        .then((j) =>
          setThumbs((x) => {
            if (x[path]) URL.revokeObjectURL(x[path]);
            return { ...x, [path]: URL.createObjectURL(new Blob([j], { type: "image/jpeg" })) };
          }),
        )
        .catch((e: unknown) => console.warn(`[stage] pratinjau gagal: ${errText(e)}`)),
    [p],
  );
  // LUT berganti → pratinjau yang tampil (rombongan aktif + foto tes terakhir) dirender ulang.
  const lutAt = lut?.at ?? 0;
  const thumbPaths = useRef<string[]>([]);
  thumbPaths.current = Object.keys(thumbs);
  // biome-ignore lint/correctness/useExhaustiveDependencies: dipicu pergantian LUT saja
  useEffect(() => {
    for (const path of thumbPaths.current.slice(-40)) makeThumb(path);
  }, [lutAt, makeThumb]);

  // Dengar rana fotografer selama layar ini terbuka.
  useEffect(() => {
    if (!stage) return;
    stage
      .listen(true)
      .catch((e: unknown) => console.error(`[stage] dengar rana gagal: ${errText(e)}`));
    const off = stage.onShot((sh) => {
      if (setupRef.current) setTestShot({ ...sh, at: Date.now() });
      else dispatch({ type: "SHOT", shot: { ...sh, at: Date.now() }, id: newSessionId() });
      makeThumb(sh.path);
    });
    return () => {
      off();
      void stage.listen(false).catch(() => {});
    };
  }, [stage, makeThumb]);

  // Detik berjalan: pisah otomatis (toast saat rombongan ditutup karena jeda) dan teks "… dtk lalu".
  useEffect(() => {
    const id = setInterval(() => {
      const at = Date.now();
      const st = sRef.current;
      const a = activeGroup(st);
      if (
        a?.shots.length &&
        st.gapSec !== null &&
        st.lastShotAt !== null &&
        at - st.lastShotAt > st.gapSec * 1000
      )
        say(t.toastAutoClosed(st.gapSec, a.no));
      dispatch({ type: "TICK", now: at });
      setNow(at);
    }, 1000);
    return () => clearInterval(id);
  }, [say]);

  // Rombongan dengan foto pertama → sesi tercatat (nama grup ikut).
  useEffect(() => {
    for (const g of s.groups) {
      if (!g.shots.length || started.current.has(g.id)) continue;
      started.current.set(
        g.id,
        p.db.sessionStarted({
          id: g.id,
          eventId: event.id,
          layoutVersionId: "stage",
          startedAt: iso(g.startedAt),
          source: "stage",
          groupName: g.name,
        }),
      );
    }
  }, [s.groups, p, event.id]);

  const complete = useCallback(
    async (g: StageGroup) => {
      busy.current.add(g.id);
      setSaves((x) => ({ ...x, [g.id]: "saving" }));
      try {
        await started.current.get(g.id);
        const dir = await p.storage.sessionDir(g.id);
        const css = stagePresetCss(presetRef.current);
        const assets: SessionAsset[] = [];
        for (const [i, shot] of g.shots.entries()) {
          const raw = await p.storage.readFile(shot.path);
          for (const [kind, max, q] of [
            ["original", ORIGINAL_LONG_SIDE, 0.92],
            ["thumb_original", THUMB_LONG_SIDE, 0.85],
          ] as const) {
            const bytes = await renderJpeg(raw, max, css, q, lutRef.current?.lut ?? null);
            const path = `${dir}/out/${kind}_${i + 1}.jpg`;
            await p.storage.writeFile(path, bytes);
            assets.push({ kind, idx: i + 1, path, bytes: bytes.length });
          }
        }
        await p.db.sessionCompleted({
          id: g.id,
          completedAt: iso(g.closedAt ?? Date.now()),
          photoCount: g.shots.length,
          retakeCount: 0,
          printCount: 0,
          assets,
        });
        setSaves((x) => ({ ...x, [g.id]: "saved" }));
      } catch (e) {
        console.error(`[stage] rombongan ${g.no} gagal disimpan: ${errText(e)}`);
        setSaves((x) => ({ ...x, [g.id]: "failed" }));
        busy.current.delete(g.id);
        setTimeout(() => setRetry((n) => n + 1), 5000);
      }
    },
    [p],
  );

  // Rombongan yang ditutup (tombol / jeda otomatis / batas foto) → proses & antre upload.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `retry` memicu percobaan ulang yang gagal
  useEffect(() => {
    for (const g of s.groups)
      if (g.closedAt !== null && !busy.current.has(g.id) && saves[g.id] !== "saved")
        void complete(g);
  }, [s.groups, complete, retry]);

  // Layar TV (#179): keadaan rombongan dikirim tiap berubah; status sambungan TV untuk operator.
  const [tvOn, setTvOn] = useState(false);
  useEffect(() => {
    const tv = stage?.tv;
    if (!tv) return;
    void tv.connected().then(setTvOn, () => {});
    return tv.onConnected(setTvOn);
  }, [stage]);
  useEffect(() => {
    stage?.tv.publish(
      tvState(s, {
        eventName: event.name,
        tagline: event.tagline,
        date: event.date,
        galleryUrl: event.slug ? `${guestBaseUrl}/l/${event.slug}` : null,
        guestBaseUrl,
        filter: stagePresetCss(preset),
        activeSec: event.settings.stageTvSec,
        lut: lut ? { key: lutKey(event.id), at: lut.at } : null,
        test: setupOpen && tvTest,
      }),
    );
  }, [
    s,
    preset,
    lut,
    stage,
    event.id,
    event.name,
    event.tagline,
    event.date,
    event.slug,
    event.settings.stageTvSec,
    guestBaseUrl,
    setupOpen,
    tvTest,
  ]);

  const newGroup = useCallback(() => {
    const a = activeGroup(sRef.current);
    if (a && !a.shots.length) return say(t.toastEmpty(a.no));
    dispatch({ type: "NEW_GROUP", id: newSessionId(), now: Date.now() });
    if (a) say(t.toastOpened(sRef.current.nextNo, a.no));
  }, [say]);
  const togglePause = useCallback(
    () => dispatch({ type: s.paused ? "RESUME" : "PAUSE" }),
    [s.paused],
  );
  const rename = (g: StageGroup, name: string) => {
    dispatch({ type: "RENAME", id: g.id, name });
    if (started.current.has(g.id))
      void started.current
        .get(g.id)
        ?.then(() => stage?.rename(g.id, name.trim() || null))
        .catch((e: unknown) => console.warn(`[stage] ganti nama gagal: ${errText(e)}`));
  };
  // Cetak instan 4R (#183): satu foto, warna preset, lewat antrean print yang sama dengan booth.
  const printShot = async (g: StageGroup, sh: StageShot) => {
    if (prints[sh.path]?.st === "printing") return;
    const n = prints[sh.path]?.n ?? 0;
    setPrints((x) => ({ ...x, [sh.path]: { st: "printing", n } }));
    try {
      const bmp = await createImageBitmap(new Blob([await p.storage.readFile(sh.path)]));
      try {
        const photo = stageCanvas(bmp, ORIGINAL_LONG_SIDE, "none", lutRef.current?.lut ?? null);
        const layout = stagePrintLayout(event, bmp);
        const ov = layout.overlay;
        // Frame bawaan "Lengkung" (#194): lengkung putih + font serif khusus cetakan.
        const frame =
          ov?.assetId === STAGE_ARCH
            ? {
                images: {
                  ...event.render?.images,
                  [STAGE_ARCH]: await archImage(ov.w ?? 0, ov.h ?? 0),
                },
                fonts: { ...event.render?.fonts, [STAGE_SERIF]: "Cormorant Garamond" },
              }
            : event.render;
        if (frame !== event.render) await document.fonts.load('96px "Cormorant Garamond"');
        const { sheet } = await renderEvent(
          { ...event, layout, ...(frame && { render: frame }) },
          [photo],
          stagePresetCss(presetRef.current),
          `${guestBaseUrl}/s/${g.id}`,
        );
        const blob = await sheet.convertToBlob({ type: "image/jpeg", quality: 0.92 });
        const stamp = Date.now().toString(36);
        const path = `${await p.storage.sessionDir(g.id)}/out/print_${stamp}.jpg`;
        await p.storage.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
        await p.printer.submit({ jobId: `${g.id}-s${stamp}`, path, copies: 1, paper: "4R" });
      } finally {
        bmp.close();
      }
      setPrints((x) => ({ ...x, [sh.path]: { st: "done", n: n + 1 } }));
    } catch (e) {
      console.error(`[stage] cetak gagal: ${errText(e)}`);
      setPrints((x) => ({ ...x, [sh.path]: { st: "failed", n } }));
    }
  };
  // Riwayat (#195): sembunyikan, pisah, gabung. Cloud diperbarui lewat metadata sesi (hiddenIdx) & aset baru.
  const sync = (g: StageGroup, hidden: number[]) =>
    void started.current
      .get(g.id)
      ?.then(() => stage?.hide(g.id, hidden))
      .catch((e: unknown) => console.warn(`[stage] sembunyikan gagal: ${errText(e)}`));
  const hidePhotos = (g: StageGroup) => {
    if (!sel.length) return say(t.toastPickHide);
    const allHidden = sel.every((i) => g.hidden?.includes(i));
    dispatch({ type: "HIDE", id: g.id, idx: sel, hidden: !allHidden });
    const h = new Set(g.hidden ?? []);
    for (const i of sel) allHidden ? h.delete(i) : h.add(i);
    sync(g, [...h]);
    setSel([]);
    say(allHidden ? t.toastShown : t.toastHidden(sel.length));
  };
  const splitPhotos = (g: StageGroup) => {
    if (!sel.length) return say(t.toastPickSplit);
    const visible = g.shots.filter((_, i) => !g.hidden?.includes(i + 1)).length;
    if (sel.filter((i) => !g.hidden?.includes(i)).length >= visible) return say(t.toastKeepOne);
    dispatch({ type: "SPLIT", id: g.id, idx: sel, newId: newSessionId(), now: Date.now() });
    sync(g, [...new Set([...(g.hidden ?? []), ...sel])]);
    const part = String.fromCharCode(98 + s.groups.filter((x) => x.no === g.no && x.part).length);
    say(t.toastSplit(sel.length, `${g.no}${part}`));
    setSel([]);
    setOpenHist(null);
  };
  const mergePhotos = async (g: StageGroup, into: StageGroup) => {
    if (saves[g.id] !== "saved" || saves[into.id] !== "saved") return say(t.toastWaitSave);
    const moved = g.shots.filter((_, i) => !g.hidden?.includes(i + 1));
    if (into.shots.length + moved.length > STAGE_MAX_SHOTS) return say(t.toastTooMany);
    try {
      const dir = await p.storage.sessionDir(into.id);
      const css = stagePresetCss(presetRef.current);
      const assets: SessionAsset[] = [];
      for (const [k, shot] of moved.entries()) {
        const raw = await p.storage.readFile(shot.path);
        const idx = into.shots.length + k + 1;
        for (const [kind, max, q] of [
          ["original", ORIGINAL_LONG_SIDE, 0.92],
          ["thumb_original", THUMB_LONG_SIDE, 0.85],
        ] as const) {
          const bytes = await renderJpeg(raw, max, css, q, lutRef.current?.lut ?? null);
          const path = `${dir}/out/${kind}_${idx}.jpg`;
          await p.storage.writeFile(path, bytes);
          assets.push({ kind, idx, path, bytes: bytes.length });
        }
      }
      await stage?.append(into.id, into.shots.length + moved.length, assets);
      await stage?.hide(
        g.id,
        g.shots.map((_, i) => i + 1),
      );
      dispatch({ type: "MERGE", id: g.id, into: into.id });
      setSel([]);
      setOpenHist(null);
      say(t.toastMerged(groupNo(g), groupNo(into)));
    } catch (e) {
      console.error(`[stage] gabung gagal: ${errText(e)}`);
      say(errText(e));
    }
  };
  const setGap = (gapSec: number | null) => {
    localStorage.setItem(GAP_KEY, gapSec === null ? "off" : String(gapSec));
    dispatch({ type: "SET_GAP", gapSec });
  };
  const pickLut = async (f: File) => {
    try {
      if (f.size > 8e6) throw new Error(t.lutTooBig);
      const text = await f.text();
      try {
        parseCube(text);
      } catch {
        throw new Error(t.lutBroken);
      }
      const at = Date.now();
      try {
        localStorage.setItem(lutKey(event.id), JSON.stringify({ name: f.name, text, at }));
      } catch {
        throw new Error(t.lutTooBig);
      }
      setLut(storedLut(lutKey(event.id)));
      setLutError(null);
    } catch (e) {
      setLutError(errText(e));
    }
  };
  const removeLut = () => {
    localStorage.removeItem(lutKey(event.id));
    setLut(null);
  };
  const savePreset = (next: StagePreset) => {
    setPreset(next);
    localStorage.setItem(presetKey(event.id), JSON.stringify(next));
  };

  const cur = activeGroup(s);
  // Daftar grup dari klien/WO (#181): yang belum dipakai rombongan mana pun, urut rundown.
  const list = event.settings.stageGroups;
  const used = new Set(s.groups.flatMap((g) => (g.name ? [g.name.toLowerCase()] : [])));
  const next = list.filter((n) => !used.has(n.toLowerCase()));
  const pickName = (name: string) => {
    if (cur && (!cur.shots.length || !cur.name)) return rename(cur, name);
    const id = newSessionId();
    dispatch({ type: "NEW_GROUP", id, now: Date.now() });
    dispatch({ type: "RENAME", id, name });
  };
  const pickRef = useRef(pickName);
  pickRef.current = () => next[0] && pickName(next[0]);

  // Keyboard (#186): ⏎ rombongan baru, Spasi jeda/lanjut, Tab isi nama dari daftar (juga di isian), Esc tutup.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setColorOpen(false);
        setOpenHist(null);
        return;
      }
      if (colorOpen || setupRef.current) return;
      if (e.key === "Tab") {
        e.preventDefault();
        pickRef.current("");
        return;
      }
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      if (e.key === "Enter") {
        e.preventDefault();
        newGroup();
      } else if (e.key === " ") {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [colorOpen, newGroup, togglePause]);

  // Status bar: kamera, internet, antrean upload rombongan (polling 3 dtk).
  const closed = s.groups.filter((g) => g.closedAt !== null && !g.merged).reverse();
  const idsKey = closed
    .slice(0, 12)
    .map((g) => g.id)
    .join(",");
  useEffect(() => {
    if (!stage) return;
    let live = true;
    const poll = () =>
      stage.status(idsKey ? idsKey.split(",") : []).then(
        (x) => live && setStatus(x),
        () => live && setStatus(null),
      );
    void poll();
    const id = setInterval(poll, 3000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [stage, idsKey]);

  const cameraOk = status === undefined || !!status?.camera?.connected;
  const model = status?.camera?.model === "Hot folder" ? "folder pantau" : status?.camera?.model;
  const online = status?.online ?? true;
  const queued = status?.pendingGroups ?? 0;
  const banner: [string, string, string] | null = !cameraOk
    ? ["bg-coral", ...(t.bannerCamera as [string, string])]
    : s.paused
      ? ["bg-peach", ...(t.bannerPaused as [string, string])]
      : !tvOn
        ? ["bg-peach", ...(t.bannerTv as [string, string])]
        : !online
          ? ["bg-sky", ...(t.bannerOffline(queued) as [string, string])]
          : null;
  const segments = [
    cameraOk
      ? { label: t.camera, sub: model ?? "", dot: "bg-green", bg: "bg-white" }
      : { label: t.cameraLost, sub: "", dot: "bg-coral-strong", bg: "bg-coral" },
    tvOn
      ? { label: t.tv, sub: "", dot: "bg-green", bg: "bg-white", id: "tv-status" }
      : { label: t.tvOff, sub: "", dot: "bg-butter", bg: "bg-peach", id: "tv-status" },
    {
      label: t.upload,
      sub: queued ? t.queued(queued) : "",
      dot: online ? "bg-mint" : "bg-butter",
      bg: online ? "bg-white" : "bg-peach",
    },
    online
      ? { label: t.internet, sub: "", dot: "bg-green", bg: "bg-white" }
      : { label: t.offline, sub: "", dot: "bg-butter", bg: "bg-peach" },
  ];

  const shots = cur?.shots ?? [];
  const n = shots.length;
  const hero = shots.at(-1);
  const rest = shots.slice(Math.max(0, n - 5), -1).reverse();
  const elapsed = s.lastShotAt === null ? 0 : Math.max(0, Math.round((now - s.lastShotAt) / 1000));
  const autoOn = s.gapSec !== null;
  const autoPct = autoOn && n && !s.paused ? Math.min(100, (elapsed / (s.gapSec ?? 1)) * 100) : 0;
  const autoText = !autoOn
    ? t.autoOffText
    : s.paused
      ? t.autoPausedText
      : n
        ? t.autoIn(Math.max(0, (s.gapSec ?? 0) - elapsed))
        : t.autoAfter(s.gapSec ?? 0);
  const qrGroup = cur?.shots.length ? cur : closed[0];
  const css = stagePresetCss(preset);
  const histRows = openHist
    ? closed.filter((g) => g.id === openHist)
    : closed.slice(0, banner ? 2 : 3);
  const histStatus = (g: StageGroup): [string, string] =>
    saves[g.id] === "failed"
      ? [t.histFailed, "bg-coral"]
      : saves[g.id] !== "saved"
        ? [t.histSaving, "bg-sky"]
        : status?.pending.includes(g.id)
          ? online
            ? [t.histUploading, "bg-sky"]
            : [t.histQueued, "bg-peach"]
          : [t.histUploaded, "bg-mint-soft"];
  const big =
    "pressable layered flex h-24 items-center gap-5 rounded-3xl border-[3px] border-ink px-8 text-[30px] font-extrabold tracking-[-0.02em] whitespace-nowrap [--lb:3px] [--lx:8px]";

  const photo = (sh: StageShot, large: boolean) => {
    const pr = prints[sh.path];
    return (
      <div
        key={sh.path}
        className={`flex min-h-0 flex-col rounded-[18px] border-[2.5px] border-ink bg-white ${large ? "layered p-3 pb-0 [--lb:2.5px] [--lx:6px] [--under:#fff]" : "p-2.5 pb-0"}`}
      >
        <div
          className={`min-h-0 flex-1 overflow-hidden bg-neutral ${large ? "rounded-lg" : "rounded-[7px]"}`}
        >
          {thumbs[sh.path] && (
            <img
              src={thumbs[sh.path]}
              alt=""
              style={{ filter: css }}
              className="size-full object-cover"
            />
          )}
        </div>
        <div
          className={`flex flex-none items-center justify-between gap-2 ${large ? "h-[60px]" : "h-[54px]"}`}
        >
          <span
            className={`whitespace-nowrap font-mono text-text-2 ${large ? "text-sm" : "text-[13px]"}`}
          >
            {hms(sh.at)}
            {large && ` · ${t.latest}`}
          </span>
          <button
            type="button"
            disabled={pr?.st === "printing"}
            onClick={() => cur && void printShot(cur, sh)}
            className={`pressable flex items-center gap-1 whitespace-nowrap rounded-[11px] border-[1.5px] border-ink font-bold ${large ? "h-10 px-3.5 text-[15px]" : "h-9 px-[11px] text-sm"} ${pr?.st === "failed" ? "bg-coral" : pr?.st === "done" ? "bg-mint-soft" : pr?.st === "printing" ? "bg-peach" : "bg-white"}`}
          >
            {pr?.st === "printing"
              ? t.printing
              : pr?.st === "failed"
                ? t.printFailed
                : pr?.st === "done"
                  ? (pr.n > 1 ? t.printSentN(pr.n) : t.printSent).replace(" ✓", "")
                  : t.print}
            {pr?.st === "done" && <Check className="size-4" strokeWidth={3} aria-hidden />}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex h-full flex-col gap-6 px-10 py-8" data-testid="stage-runner">
      <header className="flex h-16 flex-none items-center gap-5">
        <div className="flex flex-none items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl border-[2.5px] border-ink bg-mint text-[22px] font-extrabold">
            T
          </span>
          <span className="text-2xl font-extrabold tracking-[-0.02em]">tetra</span>
        </div>
        <span className="flex-none whitespace-nowrap rounded-full border-2 border-ink bg-lavender px-4 py-1.5 text-lg font-bold">
          Photo Stage
        </span>
        <div className="ml-2 flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-xl font-extrabold tracking-[-0.01em]">{event.name}</span>
          <span className="font-mono text-sm text-text-2">
            {event.date}
            {!!list.length && ` · ${list.length - next.length}/${list.length} grup`}
          </span>
        </div>
        <div className="flex-1" />
        <div className="flex h-[52px] flex-none items-center overflow-hidden rounded-full border-2 border-ink bg-white">
          {segments.map((x, i) => (
            <div
              key={x.label}
              data-testid={x.id}
              className={`flex h-full items-center gap-2.5 whitespace-nowrap px-[18px] text-[17px] font-bold ${x.bg} ${i ? "border-l-[1.5px] border-ink" : ""}`}
            >
              <span
                className={`size-3 flex-none rounded-full border-[1.5px] border-ink ${x.dot}`}
              />
              {x.label}
              {x.sub && (
                <span className="font-mono text-[15px] font-medium text-text-3">{x.sub}</span>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setColorOpen(true)}
          className="pressable h-[52px] flex-none rounded-[14px] border-2 border-ink bg-white px-[22px] text-lg font-bold"
        >
          {t.color}
        </button>
        <button
          type="button"
          onClick={onCrew}
          className="pressable h-[52px] flex-none rounded-[14px] border-2 border-ink bg-white px-[22px] text-lg font-bold"
        >
          {t.crew}
        </button>
      </header>

      {banner && (
        <div
          role="status"
          className={`-mt-1.5 flex min-h-[60px] flex-none items-center gap-3.5 rounded-[18px] border-[2.5px] border-ink px-6 py-2.5 text-[19px] font-bold ${banner[0]}`}
        >
          <span>{banner[1]}</span>
          <span className="font-medium text-text-3">{banner[2]}</span>
          <span className="flex-1" />
          {s.paused && cameraOk && (
            <span className="flex items-center gap-2.5 whitespace-nowrap font-medium text-text-3">
              {t.press}
              <Key>Spasi</Key>
              {t.toResume}
            </span>
          )}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_452px] gap-8">
        <section className="layered flex min-h-0 flex-col gap-6 rounded-[36px] border-[3px] border-ink bg-white px-10 pt-8 pb-7 [--lb:3px] [--lx:12px] [--under:var(--mint)]">
          <div className="flex flex-none items-end gap-7">
            <div className="flex flex-none flex-col gap-1">
              <span className="font-mono text-base tracking-[0.06em] text-text-2">
                {t.groupCaps}
              </span>
              <span className="text-[84px] leading-[0.85] font-extrabold tracking-[-0.05em]">
                #{cur?.no ?? s.nextNo}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-text-2">{t.nameLabel}</span>
                {!!next.length && (
                  <span className="flex items-center gap-2 text-[15px] text-muted">
                    <span className="rounded-md border-[1.5px] border-muted px-[7px] font-mono text-[13px]">
                      Tab
                    </span>
                    {t.fillHint}
                  </span>
                )}
              </div>
              <input
                aria-label={t.namePlaceholder}
                placeholder={`Tamu · ${hm(cur?.startedAt ?? now)}`}
                value={cur?.name ?? ""}
                disabled={!cur}
                onChange={(e) =>
                  cur && dispatch({ type: "RENAME", id: cur.id, name: e.target.value })
                }
                onBlur={(e) => cur && rename(cur, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className="h-[76px] w-full rounded-[20px] border-[2.5px] border-ink bg-white px-6 text-[34px] font-extrabold tracking-[-0.02em] outline-none placeholder:text-muted focus:shadow-[0_0_0_4px_var(--mint)]"
              />
            </div>
          </div>

          {hero ? (
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-6">
              {photo(hero, true)}
              <div className="grid min-h-0 grid-cols-2 grid-rows-2 gap-6">
                {rest.map((sh) => photo(sh, false))}
                {rest.length < 4 && (
                  <div
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-[18px] border-2 border-dashed p-4 text-center ${!cameraOk ? "border-ink bg-coral" : s.paused ? "border-ink bg-peach" : "border-muted bg-white"}`}
                  >
                    <span className="text-base font-bold">
                      {!cameraOk ? t.cameraLost : s.paused ? t.slotPaused : t.slotTitle}
                    </span>
                    <span className="text-sm leading-[1.4] text-text-3">
                      {!cameraOk ? t.slotCameraSub : s.paused ? t.slotPausedSub : t.slotSub}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              className={`flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-3xl border-[2.5px] border-dashed border-ink text-center ${!cameraOk ? "bg-coral" : s.paused ? "bg-peach" : "bg-white"}`}
            >
              <span className="text-[34px] font-extrabold tracking-[-0.02em]">
                {!cameraOk ? t.cameraLost : s.paused ? t.slotPaused : t.emptyTitle}
              </span>
              <span className="text-[19px] text-text-3">
                {!cameraOk ? t.emptyCameraSub : s.paused ? t.emptyPausedSub : t.emptySub}
              </span>
            </div>
          )}

          {s.loose.length ? (
            <div
              data-testid="stage-loose"
              className="flex flex-none items-center gap-4 rounded-[20px] border-[2.5px] border-ink bg-peach py-3 pr-3.5 pl-5"
            >
              <div className="flex flex-none flex-col gap-0.5">
                <span className="text-lg font-extrabold">{t.looseTitle}</span>
                <span className="text-sm text-text-3">{t.looseSub(s.loose.length)}</span>
              </div>
              <div className="flex min-w-0 flex-1 gap-2 overflow-hidden">
                {s.loose.map((sh) => (
                  <div
                    key={sh.path}
                    className="h-14 w-[84px] flex-none overflow-hidden rounded-lg border-[1.5px] border-ink bg-neutral"
                  >
                    {thumbs[sh.path] && (
                      <img
                        src={thumbs[sh.path]}
                        alt=""
                        style={{ filter: css }}
                        className="size-full object-cover"
                      />
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  dispatch({ type: "ASSIGN_LOOSE", id: newSessionId(), now: Date.now() })
                }
                className="pressable h-12 whitespace-nowrap rounded-[13px] border-2 border-ink bg-white px-4 text-base font-bold"
              >
                {t.looseToActive(cur?.no ?? s.nextNo)}
              </button>
              <button
                type="button"
                onClick={() =>
                  dispatch({ type: "LOOSE_TO_NEW", id: newSessionId(), now: Date.now() })
                }
                className="pressable h-12 whitespace-nowrap rounded-[13px] border-2 border-ink bg-white px-4 text-base font-bold"
              >
                {t.looseToNew}
              </button>
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: "DROP_LOOSE" });
                  say(t.looseHidden);
                }}
                className="h-12 whitespace-nowrap rounded-[13px] border-[1.5px] border-dashed border-ink px-3.5 text-base font-bold"
              >
                {t.looseHide}
              </button>
            </div>
          ) : (
            <div className="flex flex-none items-center gap-[18px] whitespace-nowrap border-t-2 border-dashed border-ink pt-[18px]">
              <span className="text-[17px] font-bold">{t.photos(n)}</span>
              <span className="text-muted">·</span>
              <span className="text-[17px] text-text-3">{n ? t.lastShot(elapsed) : t.noShot}</span>
              <div className="mx-1.5 h-2.5 flex-1 overflow-hidden rounded-full border-[1.5px] border-ink bg-white">
                <div className="h-full bg-mint" style={{ width: `${autoPct}%` }} />
              </div>
              <span className="text-base text-text-2">{autoText}</span>
            </div>
          )}
        </section>

        <aside className="flex min-h-0 flex-col gap-5">
          {qrGroup && (
            <div className="flex flex-none items-center gap-4 rounded-[28px] border-[2.5px] border-ink bg-white p-3.5">
              <div className="flex-none rounded-[14px] border-2 border-ink bg-white p-1.5">
                <QrCode url={`${guestBaseUrl}/s/${qrGroup.id}`} size={110} />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[15px] font-bold text-text-2">{t.qrTitle(qrGroup.no)}</span>
                <span className="line-clamp-2 text-[19px] leading-[1.2] font-extrabold tracking-[-0.02em]">
                  {groupLabel(qrGroup)}
                </span>
                <span className="text-sm leading-[1.35] text-text-3">
                  {tvOn ? t.qrNote : t.qrNoteNoTv}
                </span>
              </div>
            </div>
          )}

          {!!list.length && (
            <div
              data-testid="stage-next"
              className="flex flex-none flex-col gap-2.5 rounded-[28px] border-[2.5px] border-ink bg-white px-[22px] py-[18px]"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-extrabold tracking-[-0.02em]">{t.nextTitle}</span>
                <span className="font-mono text-[15px] text-text-3">
                  {list.length - next.length}/{list.length}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full border-[1.5px] border-ink bg-white">
                <div
                  className="h-full bg-mint"
                  style={{ width: `${((list.length - next.length) / list.length) * 100}%` }}
                />
              </div>
              <div className="flex flex-col">
                {next.slice(0, 5).map((g, i) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => pickName(g)}
                    className="flex h-9 items-center gap-3 rounded-lg border-b-[1.5px] border-dashed border-line-soft px-1.5 text-left text-[17px] font-semibold hover:bg-paper"
                  >
                    <span className="w-[18px] font-mono text-[13px] text-muted">{i + 1}</span>
                    <span className="flex-1 truncate">{g}</span>
                    {i === 0 && <span className="font-mono text-xs text-text-2">Tab</span>}
                  </button>
                ))}
              </div>
              <span className="whitespace-nowrap text-[13px] text-muted">
                {t.nextHint(cur?.no ?? s.nextNo)}
              </span>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[28px] border-[2.5px] border-ink bg-white px-[22px] py-4">
            <span className="mb-1 text-xl font-extrabold tracking-[-0.02em]">{t.history}</span>
            {histRows.map((g) => {
              const [label, bg] = histStatus(g);
              const last = [...g.shots]
                .reverse()
                .find((_, i) => !g.hidden?.includes(g.shots.length - i));
              const open = openHist === g.id;
              const hiddenN = g.hidden?.length ?? 0;
              const into = closed[closed.indexOf(g) + 1];
              const selHidden = sel.length > 0 && sel.every((i) => g.hidden?.includes(i));
              const act = `h-8 flex-1 whitespace-nowrap rounded-[10px] border-[1.5px] border-ink bg-white text-[13px] font-bold ${sel.length ? "" : "opacity-45"}`;
              return (
                <div
                  key={g.id}
                  data-testid="stage-history-row"
                  className="flex flex-none flex-col border-b-[1.5px] border-dashed border-line-soft"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpenHist(open ? null : g.id);
                      setSel([]);
                    }}
                    className="flex h-[52px] items-center gap-3.5 text-left"
                  >
                    <span className="h-[38px] w-[57px] flex-none overflow-hidden rounded-[7px] border-[1.5px] border-ink bg-neutral">
                      {last && thumbs[last.path] && (
                        <img
                          src={thumbs[last.path]}
                          alt=""
                          style={{ filter: css }}
                          className="size-full object-cover"
                        />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-base font-bold">{groupLabel(g)}</span>
                      <span className="truncate font-mono text-[13px] text-text-2">
                        #{groupNo(g)} · {t.histCount(g.shots.length - hiddenN, hiddenN)} ·{" "}
                        {hm(g.startedAt)}
                      </span>
                    </span>
                    <span
                      className={`flex-none whitespace-nowrap rounded-full border-[1.5px] border-ink px-2.5 py-[3px] text-[13px] font-bold ${bg}`}
                    >
                      {label}
                    </span>
                  </button>
                  {open && (
                    <div className="flex flex-col gap-1.5 pt-0.5 pb-2.5">
                      <input
                        key={`${g.id}:${g.name ?? ""}`}
                        aria-label={`${t.namePlaceholder} #${groupNo(g)}`}
                        defaultValue={g.name ?? ""}
                        placeholder={groupLabel(g)}
                        onBlur={(e) =>
                          e.target.value !== (g.name ?? "") && rename(g, e.target.value)
                        }
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        className="h-9 rounded-xl border-2 border-ink bg-white px-3 text-base font-bold shadow-[0_0_0_3px_var(--mint-soft)] outline-none"
                      />
                      <div className="flex flex-wrap items-center gap-1.5">
                        {g.shots.map((sh, i) => {
                          const idx = i + 1;
                          const on = sel.includes(idx);
                          const hid = g.hidden?.includes(idx);
                          return (
                            <button
                              key={sh.path}
                              type="button"
                              aria-pressed={on}
                              aria-label={`Foto ${idx}${hid ? ` (${t.histHidden})` : ""}`}
                              onClick={() =>
                                setSel((x) => (on ? x.filter((k) => k !== idx) : [...x, idx]))
                              }
                              className={`relative h-8 w-12 flex-none overflow-hidden rounded-lg bg-neutral ${on ? "border-2 border-ink shadow-[0_0_0_3px_var(--mint)]" : "border-[1.5px] border-ink"}`}
                            >
                              {thumbs[sh.path] && (
                                <img
                                  src={thumbs[sh.path]}
                                  alt=""
                                  style={{ filter: css, opacity: hid ? 0.35 : 1 }}
                                  className="size-full object-cover"
                                />
                              )}
                              {hid && (
                                <span className="absolute inset-0 flex items-center justify-center">
                                  <EyeOff className="size-4" strokeWidth={2.5} aria-hidden />
                                </span>
                              )}
                            </button>
                          );
                        })}
                        <span className="ml-1 text-xs leading-[1.3] text-text-2">
                          {sel.length ? t.histPicked(sel.length) : t.histPick}
                        </span>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={!into}
                          onClick={() => into && void mergePhotos(g, into)}
                          className="h-8 flex-1 whitespace-nowrap rounded-[10px] border-[1.5px] border-ink bg-white text-[13px] font-bold disabled:opacity-45"
                        >
                          {into ? t.mergeInto(groupNo(into)) : t.merge}
                        </button>
                        <button type="button" onClick={() => splitPhotos(g)} className={act}>
                          {sel.length ? t.splitN(sel.length) : t.split}
                        </button>
                        <button
                          type="button"
                          onClick={() => hidePhotos(g)}
                          className={`${act} flex-[1.3] border-dashed`}
                        >
                          {selHidden ? t.showPhotos : t.hidePhotos}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {!openHist && !!closed.length && (
              <span className="pt-2 text-[13px] text-muted">{t.histHint}</span>
            )}
          </div>
        </aside>
      </div>

      <footer className="flex h-[100px] flex-none items-center gap-5">
        <button
          type="button"
          onClick={newGroup}
          className={`${big} bg-butter [--under:var(--paper)]`}
        >
          {t.newGroup}
          <Key big>⏎ Enter</Key>
        </button>
        <button
          type="button"
          onClick={togglePause}
          className={`${big} px-[30px] text-[28px] [--under:var(--paper)] ${s.paused ? "bg-mint" : "bg-white"}`}
        >
          {s.paused ? t.resume : t.pause}
          <Key>Spasi</Key>
        </button>
        <div className="flex-1" />
        <span className="whitespace-nowrap text-lg font-bold text-text-3">{t.auto}</span>
        <div
          className={`flex h-16 items-center overflow-hidden rounded-[18px] border-[2.5px] border-ink ${autoOn ? "bg-white" : "bg-neutral"}`}
        >
          <button
            type="button"
            aria-label="Kurangi"
            disabled={!autoOn || (s.gapSec ?? 0) <= STAGE_GAP.min}
            onClick={() => setGap(Math.max(STAGE_GAP.min, (s.gapSec ?? STAGE_GAP.default) - 15))}
            className="h-full w-16 border-r-2 border-ink text-[26px] font-bold disabled:opacity-40"
          >
            −
          </button>
          <span
            className={`w-[120px] text-center font-mono text-[22px] font-medium ${autoOn ? "" : "text-muted"}`}
          >
            {t.sec(s.gapSec ?? STAGE_GAP.default)}
          </span>
          <button
            type="button"
            aria-label="Tambah"
            disabled={!autoOn || (s.gapSec ?? 0) >= STAGE_GAP.max}
            onClick={() => setGap(Math.min(STAGE_GAP.max, (s.gapSec ?? STAGE_GAP.default) + 15))}
            className="h-full w-16 border-l-2 border-ink text-[26px] font-bold disabled:opacity-40"
          >
            +
          </button>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={autoOn}
          onClick={() => setGap(autoOn ? null : STAGE_GAP.default)}
          className={`flex h-16 items-center gap-3 whitespace-nowrap rounded-[18px] border-[2.5px] border-ink px-[18px] text-lg font-bold ${autoOn ? "bg-mint-soft" : "bg-white"}`}
        >
          <span
            className={`relative h-[30px] w-[52px] flex-none rounded-full border-2 border-ink ${autoOn ? "bg-mint" : "bg-neutral"}`}
          >
            <span
              className={`absolute top-0.5 size-[22px] rounded-full border-2 border-ink bg-white transition-[left] duration-150 motion-reduce:transition-none ${autoOn ? "left-6" : "left-0.5"}`}
            />
          </span>
          {autoOn ? t.autoOn : t.autoOff}
        </button>
      </footer>

      {toast && (
        <div
          role="status"
          className="absolute top-[110px] left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-7 py-3.5 text-[19px] font-bold text-paper"
        >
          {toast}
        </div>
      )}

      {setupOpen && (
        <StageSetup
          event={event}
          testShot={testShot}
          testThumb={testShot && thumbs[testShot.path]}
          cameraOk={cameraOk}
          model={status?.camera?.model}
          tvOn={tvOn}
          tvTest={tvTest}
          setTvTest={setTvTest}
          gapSec={s.gapSec}
          setGap={setGap}
          colorSummary={[PHOTO_FILTERS.find((f) => f.id === preset.filter)?.label, lut?.name]
            .filter(Boolean)
            .join(" · ")}
          renderColor={(done) => (
            <StageColor
              inline
              doneLabel={copy.stage.setup.useForAll}
              preset={preset}
              savePreset={savePreset}
              lut={lut}
              lutError={lutError}
              pickLut={(f) => void pickLut(f)}
              removeLut={removeLut}
              shot={testShot}
              model={model}
              onClose={done}
            />
          )}
          onDone={() => {
            try {
              localStorage.setItem(readyKey, "1");
            } catch {}
            setTvTest(false);
            setSetupOpen(false);
          }}
        />
      )}

      {colorOpen && (
        <StageColor
          preset={preset}
          savePreset={savePreset}
          lut={lut}
          lutError={lutError}
          pickLut={(f) => void pickLut(f)}
          removeLut={removeLut}
          shot={[...s.groups.flatMap((g) => g.shots), ...s.loose]
            .sort((a, b) => a.at - b.at)
            .at(-1)}
          model={model}
          onClose={() => setColorOpen(false)}
        />
      )}
    </div>
  );
}
