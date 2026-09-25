import { Select } from "@/components/Select";
import { paymentProvider } from "@/lib/payments";
import { layoutName, loadTransactions, parseFilter } from "./data";
import { SimulateButton } from "./SimulateButton";

export const dynamic = "force-dynamic";

const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const time = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const STATUS: Record<string, { t: string; c: string }> = {
  paid: { t: "Berhasil", c: "bg-mint-soft" },
  pending: { t: "Menunggu", c: "bg-butter" },
  expired: { t: "Kedaluwarsa", c: "border-dashed" },
  failed: { t: "Gagal", c: "bg-coral" },
};
const input = "h-10 rounded-[11px] border-[1.5px] border-ink bg-white px-3 text-sm";

/** Transaksi photobox (desain v2 E6, FSD §5.7): ringkasan omzet, per hari & per event, tabel, export CSV. */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const f = parseFilter(await searchParams);
  const { rows, events, day } = await loadTransactions(f);
  const paid = rows.filter((r) => r.status === "paid");
  const total = paid.reduce((a, r) => a + r.amount_idr, 0);
  const packages = paid.filter((r) => r.kind === "package").length;
  const closed = rows.filter((r) => r.kind === "package" && r.status !== "pending");
  const sum = (key: (r: (typeof paid)[number]) => string) => {
    const m = new Map<string, number>();
    for (const r of paid) m.set(key(r), (m.get(key(r)) ?? 0) + r.amount_idr);
    return [...m];
  };
  const perDay = sum((r) => day(new Date(r.paid_at ?? r.created_at)));
  const perEvent = sum((r) => r.events?.name ?? "—");
  const canSimulate = !!paymentProvider()?.simulate;
  const stats = [
    { l: "Omzet", v: rp(total), i: "Rp", bg: "var(--mint-soft)" },
    { l: "Sesi terbayar", v: String(packages), i: "▣", bg: "var(--sky)" },
    {
      l: "Rata-rata per sesi",
      v: rp(packages ? Math.round(total / packages) : 0),
      i: "≈",
      bg: "var(--peach)",
    },
    {
      l: "Tingkat sukses",
      v: closed.length
        ? `${Math.round((closed.filter((r) => r.status === "paid").length / closed.length) * 100)}%`
        : "—",
      i: "✓",
      bg: "var(--lavender)",
    },
  ];
  const qs = new URLSearchParams({ from: f.from, to: f.to, ...(f.event && { event: f.event }) });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[30px] font-extrabold tracking-[-0.03em]">Transaksi</h1>
        <a
          href={`/admin/transactions/export?${qs}`}
          className="pressable layered flex h-11 items-center rounded-xl border-[1.5px] border-ink bg-butter px-[18px] text-sm font-extrabold no-underline [--lb:1.5px] [--lx:4px]"
        >
          Export CSV
        </a>
      </div>
      <form className="flex flex-wrap items-end gap-2.5 text-xs font-bold">
        <label className="flex flex-col gap-1">
          Dari
          <input type="date" name="from" defaultValue={f.from} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          Sampai
          <input type="date" name="to" defaultValue={f.to} className={input} />
        </label>
        <div className="flex flex-col gap-1">
          Event
          <Select
            name="event"
            label="Event"
            value={f.event}
            searchable
            className="h-10 w-64"
            options={[
              { value: "", label: "Semua event photobox" },
              ...events.map((e) => ({ value: e.id, label: e.name })),
            ]}
          />
        </div>
        <button
          type="submit"
          className="h-10 rounded-[11px] border-[1.5px] border-ink bg-white px-4 text-sm"
        >
          Terapkan
        </button>
      </form>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.l}
            style={{ ["--under" as string]: s.bg }}
            className="layered flex items-center gap-3.5 rounded-2xl border-[1.5px] border-ink bg-white px-[18px] py-4 [--lb:1.5px] [--lx:5px]"
          >
            <span
              className="flex size-11 flex-none items-center justify-center rounded-xl border-[1.5px] border-dashed border-ink text-[15px] font-bold"
              style={{ background: s.bg }}
            >
              {s.i}
            </span>
            <div>
              <div className="text-xs font-semibold text-text-2">{s.l}</div>
              <div
                className="mt-0.5 text-[24px] font-extrabold tracking-[-0.03em]"
                data-testid={`stat-${s.l}`}
              >
                {s.v}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 items-start gap-5 min-[1360px]:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto rounded-[18px] border-[1.5px] border-ink bg-white">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b-[1.5px] border-ink text-xs text-text-2">
                {["Waktu", "ID", "Event", "Layout", "Item", "Nominal", "Status"].map((c) => (
                  <th key={c} className="px-4 py-3 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = STATUS[r.status] ?? { t: r.status, c: "" };
                return (
                  <tr
                    key={r.id}
                    data-testid="tx-row"
                    className="border-b border-dashed border-ink last:border-b-0"
                  >
                    <td className="px-4 py-2.5">{time.format(new Date(r.created_at))}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      TRX-{r.id.slice(0, 6).toUpperCase()}
                    </td>
                    <td className="px-4 py-2.5">{r.events?.name}</td>
                    <td className="px-4 py-2.5">{layoutName(r.layout_key)}</td>
                    <td className="px-4 py-2.5">
                      {r.kind === "extra_prints" ? `+${r.prints} lembar` : "Paket"}
                    </td>
                    <td className="px-4 py-2.5 font-semibold">{rp(r.amount_idr)}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-md border-[1.5px] border-ink px-2 py-0.5 text-xs font-bold ${st.c}`}
                      >
                        {st.t}
                      </span>
                      {canSimulate && r.status === "pending" && <SimulateButton id={r.id} />}
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-text-2">
                    Belum ada transaksi di rentang ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-4">
          {[
            { t: "Omzet per hari", list: perDay },
            { t: "Omzet per event", list: perEvent },
          ].map((b) => (
            <section key={b.t} className="rounded-[18px] border-[1.5px] border-ink bg-white">
              <h2 className="border-b-[1.5px] border-dashed border-ink px-4 py-3 text-sm font-extrabold">
                {b.t}
              </h2>
              {b.list.length ? (
                b.list.map(([k, v]) => (
                  <div key={k} className="flex justify-between px-4 py-2 text-sm">
                    <span>{k}</span>
                    <span className="font-semibold">{rp(v)}</span>
                  </div>
                ))
              ) : (
                <p className="px-4 py-3 text-sm text-text-2">—</p>
              )}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
