"use client";
import { QrCode } from "@tetra/ui";

const dot = (iso: string) => iso.split("-").reverse().join(".");

/**
 * Kartu QR meja (desain B11a wedding / B11b corporate): A6 potret 105×148 mm. QR asli (finder membulat), zona
 * putih lapang di sekelilingnya. Layar: pratinjau + tombol cetak; cetak: hanya kartu, tanpa margin.
 */
export function GuestCard({
  variant,
  name,
  date,
  tagline,
  url,
  shots,
  reveal,
  approval,
}: {
  variant: "wedding" | "corporate";
  name: string;
  date: string;
  tagline: string | null;
  url: string;
  shots: number;
  reveal: "live" | "after";
  approval: "auto" | "manual";
}) {
  const note =
    reveal === "after"
      ? "Foto terbuka setelah acara · tanpa install"
      : approval === "manual"
        ? "Muncul di layar utama setelah dicek panitia"
        : "Langsung masuk album acara · tanpa install";
  return (
    <>
      <style>{"@page { size: 105mm 148mm; margin: 0 } @media print { body { margin: 0 } }"}</style>
      <div className="flex flex-col items-center gap-5 py-8 print:p-0">
        <button
          type="button"
          onClick={() => window.print()}
          className="layered pressable h-12 rounded-[14px] border-[1.5px] border-ink bg-butter px-6 text-sm font-extrabold [--lb:1.5px] [--lx:4px] print:hidden"
        >
          Cetak / Simpan PDF
        </button>
        <p className="max-w-[420px] text-center text-xs text-text-2 print:hidden">
          Di dialog cetak pilih ukuran kertas A6 atau 105×148 mm, skala 100%, tanpa margin.
        </p>
        <article
          className="flex h-[148mm] w-[105mm] flex-col overflow-hidden bg-paper text-ink shadow-[0_0_0_1.5px_var(--ink)] print:shadow-none"
          aria-label="Kartu QR meja"
        >
          {variant === "wedding" ? (
            <div className="flex flex-1 flex-col items-center px-[9mm] pt-[9mm] pb-[7mm] text-center">
              {tagline && (
                <span className="text-[11px] font-extrabold tracking-[0.12em] uppercase">
                  {tagline}
                </span>
              )}
              <h1 className="mt-[2mm] text-[30px] leading-[1.02] font-extrabold tracking-[-0.04em] text-balance">
                {name}
              </h1>
              <span className="mt-[2mm] font-mono text-[13px]">{dot(date)}</span>
              <div className="layered mt-[6mm] rounded-[18px] border-[1.5px] border-ink bg-white p-[4mm] [--lb:1.5px] [--lx:5px] [--under:var(--lavender)]">
                <QrCode url={url} size={150} />
              </div>
              <span className="mt-[6mm] text-[19px] font-extrabold tracking-[-0.02em]">
                Bantu isi album kami
              </span>
              <div className="mt-[4mm] grid w-full grid-cols-3 border-y-[1.5px] border-dashed border-ink">
                {[
                  ["01", "Scan", "kamera HP"],
                  ["02", "Isi nama", "sekali saja"],
                  ["03", "Jepret", `${shots} foto`],
                ].map(([n, t, d], i) => (
                  <div
                    key={n}
                    className={`flex flex-col items-center py-[3mm] ${i ? "border-l-[1.5px] border-dashed border-ink" : ""}`}
                  >
                    <span className="font-mono text-[10px]">{n}</span>
                    <span className="text-[13px] font-extrabold">{t}</span>
                    <span className="text-[10px] text-text-2">{d}</span>
                  </div>
                ))}
              </div>
              <div className="flex-1" />
              <div className="flex w-full items-center justify-between">
                <span className="text-[9.5px] text-text-2">{note}</span>
                <Brand />
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col">
              <div className="border-b-[1.5px] border-ink bg-sky px-[8mm] pt-[8mm] pb-[6mm]">
                <span className="inline-flex h-7 items-center rounded-full border-[1.5px] border-ink bg-butter px-3 text-[12px] font-extrabold">
                  Kamera Tamu
                </span>
                <h1 className="mt-[3mm] text-[27px] leading-[1.03] font-extrabold tracking-[-0.04em] text-balance">
                  {name}
                </h1>
              </div>
              <div className="flex flex-1 flex-col px-[8mm] pt-[6mm] pb-[6mm]">
                <div className="flex items-start gap-[5mm]">
                  <div className="layered flex-none rounded-[16px] border-[1.5px] border-ink bg-white p-[3mm] [--lb:1.5px] [--lx:5px] [--under:var(--butter)]">
                    <QrCode url={url} size={128} />
                  </div>
                  <ol className="flex flex-col gap-[3mm] pt-[2mm]">
                    {["Scan QR", "Isi nama", "Jepret"].map((s, i) => (
                      <li key={s} className="flex items-center gap-2 text-[14px] font-extrabold">
                        <span
                          className={`flex size-7 items-center justify-center rounded-full border-[1.5px] border-ink font-mono text-[12px] ${i ? "bg-white" : "bg-ink text-white"}`}
                        >
                          {i + 1}
                        </span>
                        {s}
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="mt-[6mm] flex items-center gap-3 rounded-[14px] border-[1.5px] border-ink bg-white px-4 py-3">
                  <span className="font-mono text-[30px] leading-none font-medium">{shots}</span>
                  <span className="text-[11px] leading-snug font-semibold">
                    foto per orang. {note}.
                  </span>
                </div>
                <div className="flex-1" />
                <div className="flex items-center justify-between border-t-[1.5px] border-dashed border-ink pt-[3mm]">
                  <span className="truncate font-mono text-[8.5px]">
                    {url.replace(/^https?:\/\//, "")}
                  </span>
                  <Brand />
                </div>
              </div>
            </div>
          )}
        </article>
      </div>
    </>
  );
}

const Brand = () => (
  <span className="flex flex-none items-center gap-1.5 text-[12px] font-extrabold">
    <span className="flex size-6 items-center justify-center rounded-[7px] border-[1.5px] border-ink bg-mint text-[11px]">
      T
    </span>
    tetra
  </span>
);
