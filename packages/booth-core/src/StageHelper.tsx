import { useEffect, useState } from "react";
import { copy } from "./copy";
import type { StageTvState } from "./stage";

const t = copy.stage.helper;
const POLL_MS = 2000;

/**
 * HP helper crew lewat WiFi (#206): dibuka dari QR "HP crew" di laptop stage (`http://<IP>:47870/#helper=<kode>`).
 * Crew kedua mengetik nama rombongan atau memasang nama dari daftar klien; laptop memprosesnya seperti operator.
 */
export function StageHelper({ helperKey }: { helperKey: string }) {
  const [st, setSt] = useState<StageTvState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    const load = () =>
      fetch("/api/tv", { cache: "no-store" })
        .then((r) => r.json() as Promise<StageTvState | null>)
        .then((x) => {
          setSt(x);
          setErr((e) => (e === t.offline ? null : e));
        })
        .catch(() => setErr(t.offline));
    void load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const send = async (body: object, done: string) => {
    const r = await fetch("/api/helper", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: helperKey, ...body }),
    }).catch(() => null);
    if (!r) return setErr(t.offline);
    if (r.status === 403) return setErr(t.wrongKey);
    setErr(null);
    setSaved(done);
    setTimeout(() => setSaved(null), 1500);
  };
  const groups = st?.groups ?? [];
  const row = (g: (typeof groups)[number], big: boolean) => {
    const v = draft[g.id] ?? (g.label.startsWith("Tamu · ") ? "" : g.label);
    return (
      <form
        key={g.id}
        onSubmit={(e) => {
          e.preventDefault();
          void send({ kind: "rename", id: g.id, name: v }, g.id);
        }}
        className={`flex flex-col gap-2 rounded-2xl border-[1.5px] border-ink bg-white p-3 ${big ? "layered [--lb:1.5px] [--lx:4px] [--under:var(--mint)]" : ""}`}
      >
        <span className="font-mono text-xs text-text-2">
          #{g.no} · {g.time} · {g.shots.length} foto
        </span>
        <div className="flex gap-2">
          <input
            aria-label={`Nama rombongan #${g.no}`}
            value={v}
            placeholder={g.label}
            onChange={(e) => setDraft((d) => ({ ...d, [g.id]: e.target.value }))}
            className={`min-w-0 flex-1 rounded-xl border-[1.5px] border-ink bg-white px-3 font-bold ${big ? "h-12 text-lg" : "h-10 text-base"}`}
          />
          <button
            type="submit"
            className={`pressable rounded-xl border-[1.5px] border-ink px-4 text-sm font-extrabold ${saved === g.id ? "bg-mint-soft" : "bg-butter"}`}
          >
            {saved === g.id ? t.saved : t.save}
          </button>
        </div>
      </form>
    );
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col gap-5 bg-paper px-4 pt-6 pb-10 text-ink">
      <header>
        <p className="text-xs font-bold text-text-2">{st?.eventName}</p>
        <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.02em]">
          {t.pageTitle}
        </h1>
      </header>
      {err && (
        <p
          role="alert"
          className="rounded-xl border-[1.5px] border-dashed border-ink bg-coral px-3 py-2.5 text-sm font-semibold"
        >
          {err}
        </p>
      )}
      {!!st?.next?.length && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-extrabold">{t.next}</h2>
          <div className="flex flex-wrap gap-2">
            {st.next.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => void send({ kind: "pick", name: n }, n)}
                className={`pressable rounded-full border-[1.5px] border-ink px-3.5 py-2 text-sm font-bold ${saved === n ? "bg-mint-soft" : "bg-lavender"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </section>
      )}
      {groups.length ? (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-extrabold">{t.active}</h2>
            {groups[0] && row(groups[0], true)}
          </section>
          {groups.length > 1 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-extrabold">{t.earlier}</h2>
              {groups.slice(1, 15).map((g) => row(g, false))}
            </section>
          )}
        </>
      ) : (
        <p className="text-sm text-text-2">{t.empty}</p>
      )}
    </main>
  );
}
