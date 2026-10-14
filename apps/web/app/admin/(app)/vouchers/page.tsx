import { copy } from "@/lib/copy";
import { requireMember } from "@/lib/supabase/server";
import { voucherLabel } from "@/lib/vouchers";
import { setVoucherActive } from "./actions";
import { VoucherForm } from "./VoucherForm";

export const dynamic = "force-dynamic";

const t = copy.admin.vouchers;
const date = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

/** Voucher photobox: buat kode, lihat pemakaian (pembayaran lunas ber-voucher), nyalakan/matikan. */
export default async function VouchersPage() {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const [{ data: vouchers }, { data: used }, { data: events }] = await Promise.all([
    db
      .from("vouchers")
      .select("id, code, kind, value, max_uses, starts_at, ends_at, active, events(name)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
    db
      .from("payments")
      .select("voucher_id, discount_idr")
      .eq("organization_id", orgId)
      .eq("status", "paid")
      .not("voucher_id", "is", null)
      // ponytail: dijumlah di JS; ganti ke view/RPC agregat kalau pemakaian voucher melewati 10 ribu.
      .limit(10_000),
    db
      .from("events")
      .select("id, name")
      .eq("organization_id", orgId)
      .eq("mode", "photobox")
      .is("archived_at", null)
      .order("event_date", { ascending: false }),
  ]);
  const usage = new Map<string, { n: number; idr: number }>();
  for (const u of used ?? []) {
    if (!u.voucher_id) continue;
    const m = usage.get(u.voucher_id) ?? { n: 0, idr: 0 };
    usage.set(u.voucher_id, { n: m.n + 1, idr: m.idr + u.discount_idr });
  }
  const now = Date.now();
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6">
      <header>
        <h1 className="text-[28px] font-extrabold tracking-[-0.03em]">{t.title}</h1>
        <p className="mt-1 max-w-[70ch] text-sm text-text-2">{t.subtitle}</p>
      </header>
      <VoucherForm events={(events ?? []).map((e) => ({ value: e.id, label: e.name }))} />
      <section className="rounded-2xl border-[1.5px] border-ink bg-white">
        <h2 className="border-b-[1.5px] border-dashed border-ink px-6 py-4 text-base font-extrabold">
          {t.listTitle}{" "}
          <span className="font-mono text-sm text-text-2">{vouchers?.length ?? 0}</span>
        </h2>
        {vouchers?.length ? (
          <div className="overflow-x-auto">
            <table data-testid="vouchers" className="w-full text-sm tabular-nums">
              <thead className="text-left text-xs text-text-2">
                <tr>
                  {t.cols.map((h) => (
                    <th key={h} className="px-6 py-2.5 font-bold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => {
                  const u = usage.get(v.id) ?? { n: 0, idr: 0 };
                  const late = v.ends_at && new Date(v.ends_at).getTime() <= now;
                  const full = v.max_uses !== null && u.n >= v.max_uses;
                  const [label, tone] = !v.active
                    ? [t.inactive, "border-dashed"]
                    : late
                      ? [t.expired, "bg-paper"]
                      : full
                        ? [t.usedUp, "bg-peach"]
                        : [t.active, "bg-mint-soft"];
                  const until = v.ends_at && new Date(new Date(v.ends_at).getTime() - 1);
                  return (
                    <tr key={v.id} className="border-t border-dashed border-ink/30">
                      <td className="px-6 py-3 font-mono font-bold">{v.code}</td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        {voucherLabel({ kind: v.kind as "amount" | "percent", value: v.value })}
                      </td>
                      <td className="px-6 py-3">{v.events?.name ?? t.allEvents}</td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        {v.starts_at || until
                          ? `${v.starts_at ? date.format(new Date(v.starts_at)) : "…"} – ${until ? date.format(until) : "…"}`
                          : t.always}
                      </td>
                      <td className="px-6 py-3 font-mono whitespace-nowrap">
                        {u.n} / {v.max_uses ?? t.unlimited}
                      </td>
                      <td className="px-6 py-3 font-mono whitespace-nowrap">{rp(u.idr)}</td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex h-6 items-center rounded-full border-[1.5px] border-ink px-2.5 text-xs font-bold whitespace-nowrap ${tone}`}
                        >
                          {label}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <form action={setVoucherActive}>
                          <input type="hidden" name="id" value={v.id} />
                          <input type="hidden" name="active" value={v.active ? "0" : "1"} />
                          <button type="submit" className="text-xs font-bold underline">
                            {v.active ? t.deactivate : t.activate}
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-6 py-8 text-sm text-text-2">{t.empty}</p>
        )}
      </section>
    </div>
  );
}
