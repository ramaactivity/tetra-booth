import { Button } from "@tetra/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { copy } from "../copy";
import { CrewHotspot, useCrewKeys } from "../crew/CrewEntry";
import { btn, Choice, Panel } from "../crew/parts";
import { errText } from "../errors";
import { usePlatform } from "../PlatformContext";
import type { BoothDisplay, FoundHub, StageTarget } from "../platform";
import { Logo, Stage } from "../ui";

const t = copy.display;
const RETRY_MS = 5000;
type State = Awaited<ReturnType<BoothDisplay["check"]>>;

/**
 * Layar galeri (#281): laptop yang hanya menampilkan galeri tamu laptop Photo Stage (StageTv mode browser, #205)
 * lewat WiFi. Halaman galeri laptop stage dimuat di iframe layar penuh supaya mode crew (pojok kanan atas 5×,
 * Ctrl+Shift+M) tetap milik aplikasi ini. Laptop stage dicek tiap 5 dtk; tidak menjawab → layar "Menghubungkan…"
 * dan main mencari ulang lewat id (IP berubah setelah router restart).
 */
export function StageDisplay({ onCrew }: { onCrew: () => void }) {
  const d = usePlatform().display;
  const [st, setSt] = useState<State | undefined>();
  const frame = useRef<HTMLIFrameElement>(null);
  useCrewKeys(onCrew);
  const check = useCallback(() => {
    d?.check().then(setSt, () => {});
  }, [d]);
  useEffect(() => {
    check();
    const id = setInterval(check, RETRY_MS);
    return () => clearInterval(id);
  }, [check]);
  // Setelah tamu menyentuh galeri, keyboard ada di iframe: halaman galeri meneruskan Ctrl+Shift+M lewat postMessage.
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.data === "tetra-crew" && e.source === frame.current?.contentWindow) onCrew();
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [onCrew]);

  if (st === undefined) return <Stage>{null}</Stage>;
  if (st?.state === "ok")
    return (
      <div className="fixed inset-0 bg-paper">
        <iframe
          ref={frame}
          key={st.target.url}
          title={t.title}
          data-testid="display-frame"
          src={`${st.target.url}/#display=${st.target.key}`}
          className="size-full border-0"
        />
        <div className="pointer-events-none fixed inset-0 *:pointer-events-auto">
          <CrewHotspot onCrew={onCrew} />
        </div>
      </div>
    );
  if (st?.state === "unreachable")
    return (
      <Stage>
        <main
          data-testid="display-reconnect"
          className="relative flex h-full w-full flex-col items-center justify-center gap-8 bg-paper px-20 text-center"
        >
          <CrewHotspot onCrew={onCrew} />
          <div className="absolute top-14 left-20">
            <Logo />
          </div>
          <span className="size-6 animate-pulse rounded-full border-[2.5px] border-ink bg-sky [animation-duration:1.6s]" />
          <h1 className="text-[64px] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance">
            {t.reconnect(st.target.name)}
          </h1>
          <p className="max-w-[1100px] text-[28px] leading-snug font-medium text-text-2">
            {t.reconnectHint}
          </p>
          <p className="absolute bottom-12 text-xl font-medium text-text-3">{t.crewHint}</p>
        </main>
      </Stage>
    );
  return <Connect key={st?.target.id ?? "new"} known={st?.target} onCrew={onCrew} onDone={check} />;
}

/** Belum ada laptop tujuan (atau kodenya berubah): cari laptop stage di WiFi yang sama, ketik kode, Hubungkan. */
function Connect({
  known,
  onCrew,
  onDone,
}: {
  known: StageTarget | undefined;
  onCrew: () => void;
  onDone: () => void;
}) {
  const d = usePlatform().display;
  const [list, setList] = useState<FoundHub[] | null>(null);
  const [pick, setPick] = useState<FoundHub | undefined>(known);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(known ? t.keyChanged(known.name) : "");
  const find = useCallback(() => {
    setList(null);
    d?.find().then(
      (h) => {
        setList(h);
        // Laptop yang sama (id) bisa menjawab dari alamat baru.
        setPick(
          (cur) =>
            (cur && h.find((x) => x.id === cur.id)) ?? cur ?? (h.length === 1 ? h[0] : undefined),
        );
      },
      () => setList([]),
    );
  }, [d]);
  useEffect(find, [find]);
  const connect = async () => {
    if (!pick || !d) return;
    setBusy(true);
    try {
      const r = await d.connect(pick.url, code);
      if (r === "badkey") setMsg(t.badKey);
      else if (r === null) setMsg(t.unreachable(pick.name));
      else onDone();
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stage>
      <main
        data-testid="display-setup"
        className="relative grid h-full w-full grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-14 bg-paper px-20 py-16"
      >
        <CrewHotspot onCrew={onCrew} />
        <section className="flex min-h-0 flex-col">
          <Logo />
          <h1 className="mt-16 text-[72px] leading-[0.95] font-extrabold tracking-[-0.04em]">
            {t.title}
          </h1>
          <p className="mt-6 text-[28px] leading-snug font-medium text-text-2">{t.sub}</p>
          <p className="mt-auto text-xl font-medium text-text-3">{t.crewHint}</p>
        </section>
        <Panel
          title={t.pick}
          aside={
            <Button variant="secondary" className={btn} disabled={!list} onClick={find}>
              {list ? t.find : t.finding}
            </Button>
          }
          className="self-start"
        >
          {list && !list.length && (
            <p className="rounded-[18px] border-2 border-dashed border-ink bg-peach px-5 py-4 text-lg font-semibold">
              {t.none}
            </p>
          )}
          {!!list?.length && (
            <div className="grid grid-cols-2 gap-3">
              {list.map((h) => (
                <Choice
                  key={h.id}
                  testId="display-stage-choice"
                  title={h.name}
                  detail={h.url.replace(/^http:\/\//, "")}
                  selected={pick?.id === h.id}
                  onClick={() => setPick(h)}
                />
              ))}
            </div>
          )}
          {pick && (
            <div className="flex items-end gap-4">
              <label className="flex flex-1 flex-col gap-1.5">
                <span className="text-lg font-bold text-text-2">
                  {t.code} · {pick.name}
                </span>
                <input
                  data-testid="display-code"
                  inputMode="numeric"
                  maxLength={4}
                  className="h-16 w-full rounded-[14px] border-[2.5px] border-ink bg-white px-4 font-mono text-3xl tracking-[0.3em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  onKeyDown={(e) => e.key === "Enter" && code.length === 4 && void connect()}
                />
              </label>
              <Button
                className={`${btn} [--lx:6px]`}
                disabled={busy || code.length !== 4}
                onClick={() => void connect()}
              >
                {busy ? t.connecting : t.connect}
              </Button>
            </div>
          )}
          {pick && !msg && <p className="text-lg font-medium text-text-2">{t.codeHint}</p>}
          {msg && (
            <p
              role="alert"
              data-testid="display-msg"
              className="rounded-[18px] border-2 border-ink bg-coral px-5 py-4 text-lg font-semibold"
            >
              {msg}
            </p>
          )}
        </Panel>
      </main>
    </Stage>
  );
}
