import { type CodeState, codeState, promoConfig } from "@/lib/promo";
import { presignGet } from "@/lib/r2";
import { requireMember } from "@/lib/supabase/server";
import { setRejected } from "./actions";
import { PromoForm } from "./PromoForm";

export const dynamic = "force-dynamic";

const time = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const STATUS: Record<string, { t: string; c: string }> = {
  new: { t: "Baru", c: "bg-butter" },
  queued: { t: "Antre Hermes", c: "bg-sky" },
  sent: { t: "Sudah dichat", c: "bg-lavender" },
  replied: { t: "Membalas", c: "bg-mint-soft" },
  converted: { t: "Booking", c: "bg-mint" },
  opted_out: { t: "Berhenti", c: "border-dashed" },
};
const CODE_STATE: Record<CodeState, string> = {
  valid: "Aktif",
  redeemed: "Dipakai",
  rejected: "Ditolak",
  expired: "Kedaluwarsa",
};
const PROOF: Record<string, string> = { instagram: "Story IG", review: "Ulasan Google" };

/**
 * Promosi halaman tamu (#215): pengaturan kartu (akun sosial, ulasan, promo) + daftar tamu yang meninggalkan nomor
 * WA. Lead ini ditarik Hermes (Bruno) lewat /api/hermes/leads; statusnya diperbarui dari sana.
 */
export default async function PromoPage() {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const [{ data: org }, { data: leads }] = await Promise.all([
    db.from("organizations").select("promo").eq("id", orgId).single(),
    db
      .from("leads")
      .select(
        "id, data, created_at, promo_code, promo_expires_at, promo_rejected_at, redeemed_at, redeemed_project_id, proof_kind, proof_key, contact_status, events(name)",
      )
      .eq("organization_id", orgId)
      .eq("kind", "sales")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  const rows = await Promise.all(
    (leads ?? []).map(async (l) => ({
      ...l,
      wa: String((l.data as { whatsapp?: string }).whatsapp ?? ""),
      proof: l.proof_key ? await presignGet(l.proof_key, 3600) : null,
    })),
  );
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6">
      <header>
        <h1 className="text-[28px] font-extrabold tracking-[-0.03em]">Promosi tamu</h1>
        <p className="mt-1 max-w-[70ch] text-sm text-text-2">
          Kartu kecil di bawah foto tamu: follow & tag Instagram (akun ini + IG klien di pengaturan
          event), ulasan Google, dan “Mau pakai di acaramu?”. Nomor WA yang masuk dihubungi Hermes.
        </p>
      </header>
      <PromoForm cfg={promoConfig(org?.promo)} />
      <section className="rounded-2xl border-[1.5px] border-ink bg-white">
        <h2 className="border-b-[1.5px] border-dashed border-ink px-6 py-4 text-base font-extrabold">
          Nomor masuk <span className="font-mono text-sm text-text-2">{rows.length}</span>
        </h2>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table data-testid="promo-leads" className="w-full text-sm">
              <thead className="text-left text-xs text-text-2">
                <tr>
                  {["Waktu", "WhatsApp", "Event", "Kode", "Bukti", "Status"].map((h) => (
                    <th key={h} className="px-6 py-2.5 font-bold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = STATUS[r.contact_status] ?? { t: r.contact_status, c: "" };
                  return (
                    <tr key={r.id} className="border-t border-dashed border-ink/30">
                      <td className="px-6 py-3 whitespace-nowrap">
                        {time.format(new Date(r.created_at))}
                      </td>
                      <td className="px-6 py-3 font-mono">
                        <a href={`https://wa.me/${r.wa}`} target="_blank" rel="noopener">
                          {r.wa}
                        </a>
                      </td>
                      <td className="px-6 py-3">{r.events?.name ?? "—"}</td>
                      <td className="px-6 py-3">
                        {r.promo_code ? (
                          <div className="flex flex-col items-start gap-1">
                            <span className="font-mono font-bold">{r.promo_code}</span>
                            <span className="text-xs text-text-2">
                              {CODE_STATE[codeState(r)]}
                              {r.redeemed_project_id && ` · ${r.redeemed_project_id}`}
                            </span>
                            {!r.redeemed_at && (
                              <form action={setRejected}>
                                <input type="hidden" name="id" value={r.id} />
                                <input
                                  type="hidden"
                                  name="reject"
                                  value={r.promo_rejected_at ? "0" : "1"}
                                />
                                <button type="submit" className="text-xs font-bold underline">
                                  {r.promo_rejected_at ? "Pulihkan" : "Tolak"}
                                </button>
                              </form>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-6 py-3">
                        {r.proof ? (
                          <a href={r.proof} target="_blank" rel="noopener">
                            {PROOF[r.proof_kind ?? ""] ?? "Lihat"}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`rounded-full border-[1.5px] border-ink px-2.5 py-0.5 text-xs font-bold ${st.c}`}
                        >
                          {st.t}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-6 py-8 text-sm text-text-2">Belum ada tamu yang meninggalkan nomor.</p>
        )}
      </section>
    </div>
  );
}
