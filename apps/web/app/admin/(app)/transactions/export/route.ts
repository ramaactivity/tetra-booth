import { layoutName, loadTransactions, parseFilter } from "../data";

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** Export CSV transaksi (FSD §5.7) dengan filter yang sama dengan halaman. */
export async function GET(req: Request) {
  const f = parseFilter(Object.fromEntries(new URL(req.url).searchParams));
  const { rows } = await loadTransactions(f);
  const head = [
    "waktu",
    "id",
    "event",
    "device",
    "layout",
    "jenis",
    "lembar",
    "nominal_idr",
    "status",
    "sesi",
  ];
  const lines = rows.map((r) =>
    [
      r.created_at,
      r.id,
      r.events?.name,
      r.devices?.name,
      layoutName(r.layout_key),
      r.kind === "extra_prints" ? "tambahan cetak" : "paket",
      r.prints,
      r.amount_idr,
      r.status,
      r.session_id,
    ]
      .map(cell)
      .join(","),
  );
  return new Response(`${[head.join(","), ...lines].join("\n")}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transaksi-${f.from}_${f.to}.csv"`,
    },
  });
}
