import { Button } from "@tetra/ui";
import { useEffect, useState } from "react";
import { copy } from "../copy";
import { Done, QrCode } from "../ui";

/** Perkiraan waktu keluar per lembar (DNP ±8–15 s). ponytail: konstanta, ganti dengan status spooler kalau ada. */
export const PRINT_SEC_PER_SHEET = 12;

/**
 * Layar cetak + QR ke halaman tamu (A8). Tampil sejak fase printing; QR langsung muncul walau offline
 * (FSD §1.11). Cetak gagal → A11: cetakan tertunda, tamu tetap scan QR (tanpa tombol, selesai lewat timer).
 */
export function Qr({
  url,
  stripUrl,
  sheets,
  counting,
  seconds,
  print,
  onDone,
}: {
  url: string;
  /** Tanpa strip (compose gagal) = tanpa cetak, hanya QR. */
  stripUrl: string | undefined;
  sheets: number;
  /** Hitung mundur kembali ke awal berjalan (fase qr). */
  counting: boolean;
  seconds: number;
  print: "pending" | "done" | "failed";
  onDone: () => void;
}) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (!counting) return;
    setLeft(seconds);
    const t = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [counting, seconds]);

  if (stripUrl && print === "failed") {
    return (
      <main className="grid h-full w-full grid-cols-2 bg-paper portrait:grid-cols-1">
        <section className="flex flex-col justify-center gap-8 px-[110px] py-24 portrait:px-16 portrait:py-12">
          <span className="flex size-[120px] items-center justify-center rounded-[32px] border-[3px] border-dashed border-ink bg-peach text-[60px] font-extrabold">
            !
          </span>
          <h1 className="text-[72px] leading-[1.05] font-extrabold tracking-[-0.035em]">
            {copy.print.delayed}
          </h1>
          <p className="text-[30px] leading-normal font-medium text-text-2">
            {copy.print.delayedBody}
          </p>
          <div className="overflow-hidden rounded-[22px] border-[2.5px] border-ink bg-white text-[26px]">
            <div className="flex justify-between px-7 py-[22px]">
              <span className="font-semibold">{copy.print.queue}</span>
              <span className="font-mono">{copy.print.sheets(sheets)}</span>
            </div>
            <div className="flex justify-between border-t-2 border-dashed border-ink px-7 py-[22px]">
              <span className="font-semibold">{copy.print.status}</span>
              <span className="font-bold">{copy.print.waitCrew}</span>
            </div>
          </div>
        </section>
        <section className="flex flex-col items-center justify-center gap-7 border-l-[2.5px] border-ink bg-sky portrait:border-t-[2.5px] portrait:border-l-0">
          <h2 className="text-[44px] font-extrabold tracking-[-0.03em]">{copy.print.scanWhile}</h2>
          <div className="layered rounded-[32px] border-[2.5px] border-ink bg-white p-7 [--lx:10px] [--under:var(--sky)]">
            <QrCode url={url} size={356} />
          </div>
          <p className="text-2xl font-semibold text-text-3">{copy.print.digital}</p>
        </section>
      </main>
    );
  }

  const printing = sheets > 0;
  // Kolom kanan: satu sumbu tengah dengan lebar sama untuk kartu QR dan tombol, supaya rapi (masukan Rama).
  return (
    <main
      className={`grid h-full w-full bg-paper ${stripUrl ? "grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] portrait:grid-cols-1 portrait:grid-rows-[auto_1fr]" : ""}`}
    >
      {stripUrl && (
        <section className="flex min-h-0 flex-col items-center justify-center gap-10 border-r-[2.5px] border-ink bg-peach px-20 py-16 portrait:flex-row portrait:border-r-0 portrait:border-b-[2.5px] portrait:p-12">
          <img
            src={stripUrl}
            alt=""
            className="layered max-h-[600px] max-w-[440px] min-h-0 rounded-[10px] border-[2.5px] border-ink bg-white object-contain [--lx:10px] [--under:#fff] portrait:max-h-[420px] portrait:max-w-[280px]"
          />
          {printing ? (
            <div className="flex w-[480px] flex-col gap-4 rounded-3xl border-[2.5px] border-ink bg-white px-8 py-7 portrait:w-auto portrait:flex-1">
              <span className="text-[32px] font-extrabold tracking-[-0.02em]">
                {print === "done" ? copy.print.done : copy.print.busy}
              </span>
              <div className="h-[22px] overflow-hidden rounded-[11px] border-2 border-ink bg-paper">
                <div
                  style={{ animationDuration: `${sheets * PRINT_SEC_PER_SHEET}s` }}
                  className={`h-full border-r-2 border-ink bg-mint ${print === "done" ? "w-full" : "w-0 animate-[fill_linear_forwards]"}`}
                />
              </div>
              <span className="text-[22px] font-medium text-text-2">
                {print === "done"
                  ? copy.print.take(sheets)
                  : copy.print.eta(sheets, sheets * PRINT_SEC_PER_SHEET)}
              </span>
            </div>
          ) : (
            <div className="flex w-[480px] flex-col gap-2 rounded-3xl border-[2.5px] border-dashed border-ink bg-white px-8 py-6 text-center portrait:w-auto portrait:flex-1">
              <span className="text-[30px] font-extrabold tracking-[-0.02em]">
                {copy.print.skipped}
              </span>
              <span className="text-[22px] font-medium text-text-2">{copy.print.skippedBody}</span>
            </div>
          )}
        </section>
      )}
      <section className="flex min-h-0 flex-col items-center justify-center gap-7 px-20 py-12 portrait:px-12">
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-[64px] leading-[1.05] font-extrabold tracking-[-0.04em] text-balance">
            {copy.qr.title}
          </h1>
          <p className="text-[26px] font-medium text-text-2">{copy.qr.sub}</p>
        </div>
        <div className="flex w-[420px] flex-col items-center gap-5">
          <div className="layered w-full rounded-[32px] border-[2.5px] border-ink bg-white p-7 [--lx:10px]">
            <QrCode url={url} size={356} />
          </div>
          <div className="flex gap-2.5">
            {copy.qr.chips.map((c) => (
              <span
                key={c}
                className="flex items-center gap-2 rounded-full border-2 border-ink bg-white py-1.5 pr-4 pl-1.5 text-lg font-bold"
              >
                <Done size={26} />
                {c}
              </span>
            ))}
          </div>
          <p className="text-center text-lg leading-snug font-medium text-text-3">
            {copy.qr.offline}
          </p>
          <Button className="mt-1 h-24 w-full rounded-3xl text-[30px]" onClick={onDone}>
            {copy.qr.done}
          </Button>
          <span className="text-xl font-medium text-text-2">
            {copy.qr.back} <span className="font-mono text-ink">{left}</span> {copy.qr.sec}
          </span>
        </div>
      </section>
    </main>
  );
}
