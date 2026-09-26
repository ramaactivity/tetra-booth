import type { PaymentCreateResponse } from "@tetra/shared";
import { Button } from "@tetra/ui";
import { Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { copy } from "../copy";
import { errText } from "../errors";
import { mmss, rupiah } from "../format";
import { usePlatform } from "../PlatformContext";
import { QrCode } from "../ui";

export const POLL_MS = 2000;
const t = copy.payment;

type Line = { label: string; value: string };
type State =
  | { s: "creating" }
  | { s: "waiting"; bill: PaymentCreateResponse }
  | { s: "expired" }
  | { s: "error" };

/**
 * Bayar QRIS (A3/A4b, FSD §1.12): buat tagihan → QR + total + hitung mundur → cek status tiap 2 dtk.
 * Kedaluwarsa → buat ulang; tanpa internet → "hubungi crew", tidak ada jalur bypass.
 */
export function Payment({
  request,
  lines,
  onPaid,
  onCancel,
}: {
  request: { eventId: string; sessionId: string; layoutId: string; extraPrints?: number };
  /** Rincian di atas total (A3): paket + "1 lembar cetak Termasuk", atau tambahan lembar. */
  lines: Line[];
  onPaid: (paymentId: string, amount: number) => void;
  onCancel: () => void;
}) {
  const p = usePlatform();
  const [st, setSt] = useState<State>({ s: "creating" });
  const [now, setNow] = useState(Date.now());
  const req = useRef(request);
  const paid = useRef(onPaid);
  paid.current = onPaid;

  const create = useCallback(() => {
    setSt({ s: "creating" });
    p.payments.create(req.current).then(
      (bill) => {
        console.info(`[payment] ${bill.paymentId} dibuat Rp${bill.amount}`);
        setSt({ s: "waiting", bill });
      },
      (e: unknown) => {
        console.warn(`[payment] gagal membuat QRIS: ${errText(e)}`);
        setSt({ s: "error" });
      },
    );
  }, [p]);
  useEffect(create, [create]);

  const bill = st.s === "waiting" ? st.bill : null;
  useEffect(() => {
    if (!bill) return;
    let live = true;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => {
      p.payments.status(bill.paymentId).then(
        (status) => {
          if (!live) return;
          // Hanya status akhir yang dicatat (polling tiap beberapa detik, log tidak banjir).
          if (status !== "pending") console.info(`[payment] ${bill.paymentId} ${status}`);
          if (status === "paid") paid.current(bill.paymentId, bill.amount);
          else if (status !== "pending") setSt({ s: "expired" });
        },
        (e: unknown) => console.warn(`[payment] cek status gagal: ${errText(e)}`),
      );
    }, POLL_MS);
    return () => {
      live = false;
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [p, bill]);

  const left = bill ? new Date(bill.expiresAt).getTime() - now : 0;
  const total = bill?.amount;

  if (st.s === "expired" || st.s === "error") {
    const expired = st.s === "expired";
    return (
      <main className="flex h-full w-full items-center justify-center bg-paper">
        <div className="layered flex w-[1100px] flex-col items-center gap-8 rounded-[40px] border-[3px] border-ink bg-white p-[72px] text-center [--lb:3px] [--lx:14px]">
          <span className="flex size-[120px] items-center justify-center rounded-[32px] border-[3px] border-dashed border-ink bg-peach text-[60px] font-extrabold">
            !
          </span>
          <h1 className="text-[68px] leading-[1.1] font-extrabold tracking-[-0.035em]">
            {expired ? t.expired : t.offline}
          </h1>
          {expired && <p className="text-[30px] text-text-2">{t.expiredBody}</p>}
          <div className="flex gap-8">
            <Button
              variant="secondary"
              className="h-[100px] rounded-[26px] px-16 text-[32px]"
              onClick={onCancel}
            >
              {t.cancel}
            </Button>
            <Button className="h-[100px] rounded-[26px] px-16 text-[32px]" onClick={create}>
              {expired ? t.retry : t.tryAgain}
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="grid h-full w-full grid-cols-2 bg-paper portrait:grid-cols-1 portrait:grid-rows-[50%_1fr]">
      <section className="flex items-center justify-center border-r-[2.5px] border-ink bg-sky portrait:border-r-0 portrait:border-b-[2.5px]">
        <div className="layered flex w-[640px] flex-col gap-6 rounded-[36px] border-[2.5px] border-ink bg-white p-10 [--lx:14px]">
          <div className="flex items-baseline justify-between border-b-2 border-dashed border-ink pb-6">
            <span className="text-[40px] font-extrabold">QRIS</span>
            <span className="text-[22px] text-text-2">{t.brand}</span>
          </div>
          <div className="flex h-[480px] items-center justify-center" data-testid="qris">
            {bill ? (
              <QrCode url={bill.qrString} size={480} />
            ) : (
              <div className="flex flex-col items-center gap-6">
                <div className="size-[120px] animate-spin rounded-full border-[9px] border-[#e4e2dc] border-t-ink" />
                <span className="text-[30px] font-semibold">{t.creating}</span>
              </div>
            )}
          </div>
          <p className="text-center font-mono text-[26px]">
            {bill ? `${t.validFor} ${mmss(left)}` : " "}
          </p>
        </div>
      </section>
      <section className="flex flex-col justify-center gap-10 px-[110px] portrait:px-16">
        <div className="overflow-hidden rounded-[28px] border-[2.5px] border-ink bg-white text-[30px]">
          {lines.map((l, i) => (
            <div
              key={l.label}
              className={`flex justify-between px-8 py-6 ${i ? "border-t-2 border-dashed border-ink text-text-2" : "font-semibold"}`}
            >
              <span>{l.label}</span>
              <span>{l.value}</span>
            </div>
          ))}
          <div className="flex justify-between border-t-[2.5px] border-ink bg-peach px-8 py-7 text-[40px] font-extrabold">
            <span>{t.total}</span>
            <span data-testid="payment-total">{total === undefined ? "…" : rupiah(total)}</span>
          </div>
        </div>
        <ol className="flex flex-col gap-5 text-[32px] font-medium">
          {t.steps.map((step, i) => (
            <li key={step} className="flex items-center gap-6">
              <span
                className={`flex size-[64px] items-center justify-center rounded-2xl border-2 border-dashed border-ink text-[28px] font-bold ${["bg-peach", "bg-sky", "bg-mint-soft"][i]}`}
              >
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <div className="flex gap-8">
          <div className="flex flex-1 items-center gap-5 rounded-[26px] border-[2.5px] border-ink bg-white px-8 py-6 text-[30px] font-bold">
            <span className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{ animationDelay: `${i * 200}ms` }}
                  className="size-4 animate-pulse rounded-full bg-ink"
                />
              ))}
            </span>
            {t.waiting}
          </div>
          <Button
            variant="secondary"
            className="h-[104px] rounded-[26px] px-14 text-[32px]"
            onClick={onCancel}
          >
            {t.cancel}
          </Button>
        </div>
      </section>
    </main>
  );
}

/** Pembayaran berhasil (A4a); sesi mulai setelah hitung mundur. */
export function Paid({ amount, name, seconds }: { amount: number; name: string; seconds: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const id = setInterval(() => setLeft((n) => Math.max(1, n - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <main className="relative flex h-full w-full items-center justify-center overflow-hidden bg-paper">
      <div className="absolute -top-[260px] -right-[160px] size-[760px] rounded-full bg-mint-soft" />
      <div className="layered relative flex w-[1100px] flex-col items-center gap-8 rounded-[40px] border-[3px] border-ink bg-white px-[72px] py-[80px] text-center [--lb:3px] [--lx:14px]">
        <span className="flex size-[160px] items-center justify-center rounded-full border-[3px] border-ink bg-green text-white">
          <Check size={90} strokeWidth={3} />
        </span>
        <h1 className="text-[84px] leading-none font-extrabold tracking-[-0.045em] whitespace-nowrap">
          {t.success}
        </h1>
        <p className="text-[36px] text-text-2">
          {rupiah(amount)} · {name}
        </p>
        <p className="flex w-full items-center justify-center gap-4 border-t-2 border-dashed border-ink pt-8 text-[32px] font-bold">
          {t.startsIn}
          <span className="flex size-[64px] items-center justify-center rounded-full border-2 border-ink bg-butter text-[32px]">
            {left}
          </span>
        </p>
      </div>
    </main>
  );
}
