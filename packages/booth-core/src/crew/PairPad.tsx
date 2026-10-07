import { Button } from "@tetra/ui";
import { ArrowRight, Link2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { copy } from "../copy";
import { crewText } from "../errors";
import { usePlatform } from "../PlatformContext";
import { Done } from "../ui";
import { DigitPad } from "./DigitPad";

type Device = { name: string; shortCode: string };
/** loading → (sudah tersambung? already) → enter (keypad) → done (berhasil). */
type View =
  | { v: "loading" }
  | { v: "already"; d: Device }
  | { v: "enter" }
  | { v: "done"; d: Device };

/** Kartu tengah layar crew untuk status (sudah tersambung / berhasil). */
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex h-full w-full items-center justify-center bg-paper">
      <div className="layered flex w-[880px] max-w-[calc(100%-96px)] flex-col items-center gap-7 rounded-[40px] border-[3px] border-ink bg-white px-[72px] py-14 text-center [--lb:3px] [--lx:14px]">
        <span className="rounded-full border-2 border-ink bg-lavender px-[18px] py-2 text-xl font-bold">
          {copy.crew.title}
        </span>
        <Done size={88} />
        <h1 className="text-[52px] leading-tight font-extrabold tracking-[-0.03em]">{title}</h1>
        {children}
      </div>
    </main>
  );
}

/**
 * Sambungkan booth ke akun Tetra dengan kode 6 angka dari admin (FSD §1.2). Penjelasan "dari mana kodenya"
 * selalu di samping keypad; booth yang sudah tersambung tidak langsung ke keypad (sambung ulang = aksi kedua).
 */
export function PairPad({
  guestBaseUrl,
  onDone,
  onNext,
  onCancel,
}: {
  /** Server cloud, untuk alamat admin di petunjuk. */
  guestBaseUrl: string;
  onDone: () => void;
  /** Setelah berhasil: lanjut pilih event. */
  onNext: () => void;
  onCancel: () => void;
}) {
  const { crew } = usePlatform();
  const [view, setView] = useState<View>({ v: "loading" });
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    crew.status().then(
      (s) => setView(s.device ? { v: "already", d: s.device } : { v: "enter" }),
      () => setView({ v: "enter" }),
    );
  }, [crew]);

  const host = (() => {
    try {
      return new URL(guestBaseUrl).host;
    } catch {
      return guestBaseUrl;
    }
  })();

  const submit = async () => {
    setBusy(true);
    setMsg({ text: copy.crew.pairing, error: false });
    try {
      setView({ v: "done", d: await crew.pair(code) });
    } catch (e) {
      setCode("");
      setMsg({ text: crewText(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  const action = "h-24 w-full rounded-[22px] text-[30px]";
  switch (view.v) {
    case "loading":
      return <main className="h-full w-full bg-paper" />;
    case "already":
      return (
        <Card title={copy.crew.pairAlreadyTitle}>
          <p className="text-[34px] font-bold" data-testid="pair-device">
            {copy.crew.pairAlready(view.d.name, view.d.shortCode)}
          </p>
          <p className="max-w-[680px] text-2xl leading-snug font-semibold text-text-2">
            {copy.crew.pairAgainWhy}
          </p>
          <div className="flex w-full flex-col gap-4">
            <Button className={action} onClick={onCancel}>
              {copy.crew.pairBack}
            </Button>
            <Button variant="plain" className={action} onClick={() => setView({ v: "enter" })}>
              <Link2 size={30} strokeWidth={2.5} /> {copy.crew.pairAgain}
            </Button>
          </div>
        </Card>
      );
    case "done":
      return (
        <Card title={copy.crew.pairDoneTitle}>
          <p className="text-[34px] leading-snug font-bold" data-testid="pair-device">
            {copy.crew.pairDone(view.d.name, view.d.shortCode)}
          </p>
          <p className="text-2xl font-semibold text-text-2">{copy.crew.pairDoneHint}</p>
          <div className="flex w-full flex-col gap-4">
            <Button className={action} onClick={onNext}>
              {copy.crew.pairNext} <ArrowRight size={30} strokeWidth={2.5} />
            </Button>
            <Button variant="plain" className={action} onClick={onDone}>
              {copy.crew.pairBack}
            </Button>
          </div>
        </Card>
      );
    case "enter":
      return (
        <DigitPad
          title={copy.crew.pairEnter}
          value={code}
          onChange={(v) => {
            setCode(v);
            if (msg?.error) setMsg(null);
          }}
          minBoxes={6}
          maxLength={6}
          masked={false}
          status={msg?.text ?? null}
          error={msg?.error ?? false}
          locked={busy}
          onSubmit={() => void submit()}
          onCancel={onCancel}
          aside={
            <section className="flex w-[620px] flex-col gap-7" aria-labelledby="pair-title">
              <h1
                id="pair-title"
                className="text-[56px] leading-[1.05] font-extrabold tracking-[-0.035em]"
              >
                {copy.crew.pairTitle}
              </h1>
              <p className="text-2xl leading-snug font-semibold text-text-2">
                {copy.crew.pairPurpose}
              </p>
              <h2 className="text-[30px] font-extrabold tracking-[-0.02em]">
                {copy.crew.pairStepsTitle}
              </h2>
              <ol className="flex flex-col gap-5">
                {copy.crew.pairSteps(host).map((s, i) => (
                  <li key={s} className="flex gap-4">
                    <span className="flex size-12 flex-none items-center justify-center rounded-full border-[2.5px] border-ink bg-butter text-2xl font-extrabold">
                      {i + 1}
                    </span>
                    <span className="pt-1.5 text-2xl leading-snug font-semibold">{s}</span>
                  </li>
                ))}
              </ol>
            </section>
          }
        />
      );
  }
}
