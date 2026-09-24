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
            <QrCode url={url} size={360} />
          </div>
          <p className="text-2xl font-semibold text-text-3">{copy.print.digital}</p>
        </section>
      </main>
    );
  }

  return (
    <main
      className={`grid h-full w-full bg-paper ${stripUrl ? "grid-cols-[700px_1fr] portrait:grid-cols-1 portrait:grid-rows-[auto_1fr]" : ""}`}
    >
      {stripUrl && (
        <section className="flex flex-col justify-center gap-12 border-r-[2.5px] border-ink bg-peach p-[88px] portrait:flex-row portrait:items-center portrait:border-r-0 portrait:border-b-[2.5px] portrait:p-12">
          <img
            src={stripUrl}
            alt=""
            className="layered max-h-[435px] w-[290px] self-center rounded-lg border-[2.5px] border-ink bg-white object-contain [--lx:10px] [--under:#fff] portrait:w-[200px]"
          />
          <div className="flex flex-col gap-[18px] rounded-3xl border-[2.5px] border-ink bg-white px-[30px] py-7 portrait:flex-1">
            <span className="text-[32px] font-extrabold tracking-[-0.02em]">
              {print === "done" ? copy.print.done : copy.print.busy}
            </span>
            <div className="h-[22px] overflow-hidden rounded-[11px] border-2 border-ink bg-paper">
              <div
                style={{ animationDuration: `${sheets * PRINT_SEC_PER_SHEET}s` }}
                className={`h-full border-r-2 border-ink bg-mint ${print === "done" ? "w-full" : "w-0 animate-[fill_linear_forwards]"}`}
              />
            </div>
            <span className="border-t-2 border-dashed border-ink pt-4 text-[22px] font-medium text-text-2">
              {print === "done"
                ? copy.print.take(sheets)
                : copy.print.eta(sheets, sheets * PRINT_SEC_PER_SHEET)}
            </span>
          </div>
        </section>
      )}
      <section className="flex flex-col items-center justify-center gap-[22px] px-[120px] py-12 portrait:px-12">
        <h1 className="text-center text-[76px] leading-none font-extrabold tracking-[-0.04em]">
          {copy.qr.title}
        </h1>
        <p className="text-[28px] font-medium text-text-2">{copy.qr.sub}</p>
        <div className="flex gap-2.5">
          {copy.qr.chips.map((c) => (
            <span
              key={c}
              className="flex items-center gap-2.5 rounded-full border-2 border-ink bg-white py-2 pr-[18px] pl-2 text-xl font-bold"
            >
              <Done size={30} />
              {c}
            </span>
          ))}
        </div>
        <div className="layered mt-2 rounded-[32px] border-[2.5px] border-ink bg-white p-7 [--lx:10px]">
          <QrCode url={url} size={340} />
        </div>
        <p className="rounded-2xl border-2 border-dashed border-ink bg-sky px-[22px] py-3 text-center text-[21px] font-medium text-text-2">
          {copy.qr.offline}
        </p>
        <div className="mt-1.5 flex items-center gap-8">
          <Button className="h-24 w-[320px] rounded-3xl text-[30px]" onClick={onDone}>
            {copy.qr.done}
          </Button>
          <span className="text-[22px] font-medium text-text-2">
            {copy.qr.back} <span className="font-mono text-ink">{left}</span> {copy.qr.sec}
          </span>
        </div>
      </section>
    </main>
  );
}
