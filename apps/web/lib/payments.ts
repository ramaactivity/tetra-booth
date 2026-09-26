import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { LAYOUT_PRESETS, type PaymentStatus, type PresetId } from "@tetra/shared";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Pembayaran QRIS photobox (TSD §8, DECISIONS #70). `PaymentProvider` supaya provider lain / voucher bisa ditambah.
 * Midtrans Core API QRIS (#93) atau Xendit Payment Requests API (QR_CODE / QRIS). Harga selalu dari pengaturan event di DB, tidak pernah dari booth.
 */
export interface PaymentProvider {
  name: string;
  create(p: { referenceId: string; amount: number; expiresAt: Date }): Promise<{
    ref: string;
    qrString: string;
  }>;
  status(ref: string): Promise<PaymentStatus>;
  /** Uji: bayar tagihan tanpa dompet digital (mode test Xendit, sandbox Midtrans, provider palsu). */
  simulate?(ref: string, amount: number): Promise<void>;
}

const XENDIT = "https://api.xendit.co";

function xendit(key: string): PaymentProvider {
  const call = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${XENDIT}${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(`xendit ${path} ${res.status} ${String(body.error_code ?? "")}`);
    return body;
  };
  const MAP: Record<string, PaymentStatus> = {
    SUCCEEDED: "paid",
    EXPIRED: "expired",
    FAILED: "failed",
    CANCELED: "failed",
    VOIDED: "failed",
  };
  const test = key.startsWith("xnd_development_");
  return {
    name: "xendit",
    async create({ referenceId, amount, expiresAt }) {
      const pr = (await call("/payment_requests", {
        method: "POST",
        headers: { "idempotency-key": referenceId },
        body: JSON.stringify({
          reference_id: referenceId,
          amount,
          currency: "IDR",
          country: "ID",
          payment_method: {
            type: "QR_CODE",
            reusability: "ONE_TIME_USE",
            qr_code: {
              channel_code: "QRIS",
              channel_properties: { expires_at: expiresAt.toISOString() },
            },
          },
        }),
      })) as {
        id: string;
        payment_method?: { qr_code?: { channel_properties?: { qr_string?: string } } };
      };
      const qrString = pr.payment_method?.qr_code?.channel_properties?.qr_string;
      if (!qrString) throw new Error("xendit: qr_string kosong");
      return { ref: pr.id, qrString };
    },
    async status(ref) {
      const pr = await call(`/payment_requests/${encodeURIComponent(ref)}`);
      return MAP[String(pr.status)] ?? "pending";
    },
    ...(test && {
      async simulate(ref: string, amount: number) {
        await call(`/payment_requests/${encodeURIComponent(ref)}/payments/simulate`, {
          method: "POST",
          body: JSON.stringify({ amount }),
        });
      },
    }),
  };
}

/**
 * Midtrans Core API QRIS (DECISIONS #93): merchant perorangan cukup KTP + NPWP (Xendit butuh badan usaha).
 * `order_id` = id pembayaran kita, jadi status dicek dengan id itu. Sandbox kecuali
 * MIDTRANS_IS_PRODUCTION=true — key sandbox akun baru tidak lagi berawalan "SB-" (DECISIONS #95).
 */
export function midtrans(
  serverKey: string,
  production = process.env.MIDTRANS_IS_PRODUCTION === "true",
): PaymentProvider {
  const base = production ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
  const call = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    // Midtrans membalas HTTP 200 dengan status_code sendiri (mis. "404" untuk order tidak dikenal).
    const code = String(body.status_code ?? res.status);
    if (!res.ok || !/^2\d\d$/.test(code))
      throw new Error(`midtrans ${path} ${code} ${String(body.status_message ?? "")}`);
    return body;
  };
  const MAP: Record<string, PaymentStatus> = {
    settlement: "paid",
    capture: "paid",
    expire: "expired",
    deny: "failed",
    cancel: "failed",
    failure: "failed",
  };
  return {
    name: "midtrans",
    async create({ referenceId, amount, expiresAt }) {
      const minutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60_000));
      const r = await call("/v2/charge", {
        method: "POST",
        body: JSON.stringify({
          payment_type: "qris",
          transaction_details: { order_id: referenceId, gross_amount: amount },
          qris: { acquirer: "gopay" },
          custom_expiry: { expiry_duration: minutes, unit: "minute" },
        }),
      });
      const qrString = typeof r.qr_string === "string" ? r.qr_string : "";
      if (!qrString) throw new Error("midtrans: qr_string kosong");
      return { ref: referenceId, qrString };
    },
    async status(ref) {
      const r = await call(`/v2/${encodeURIComponent(ref)}/status`);
      return MAP[String(r.transaction_status)] ?? "pending";
    },
    // Sandbox: isi form QRIS Simulator Midtrans (URL gambar QR → konfirmasi → Pay); webhook menyusul dari Midtrans.
    ...(!production && {
      async simulate(ref: string) {
        const r = await call(`/v2/${encodeURIComponent(ref)}/status`);
        const qrCodeUrl = `${base}/v2/qris/${String(r.transaction_id)}/qr-code`;
        const post = async (path: string, form: Record<string, string>) => {
          const res = await fetch(`https://simulator.sandbox.midtrans.com/v2/qris/${path}`, {
            method: "POST",
            body: new URLSearchParams(form),
          });
          return res.text();
        };
        const page = await post("payment", { qrCodeUrl });
        const form = page.slice(page.indexOf('action="payment/gopay"'));
        const fields = Object.fromEntries(
          [...form.matchAll(/<input\s+name="([^"]+)"[^>]*?value="([^"]*)"/g)].map((m) => [
            m[1],
            String(m[2])
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, "&"),
          ]),
        );
        if (
          !fields.referenceId ||
          !/Status\s*(<[^>]*>\s*)*PAID/.test(await post("payment/gopay", fields))
        )
          throw new Error(`midtrans simulator gagal untuk ${ref}`);
      },
    }),
  };
}

/** Tanda tangan notifikasi Midtrans: SHA-512(order_id + status_code + gross_amount + server key). */
export function midtransSignatureOk(
  n: { order_id?: unknown; status_code?: unknown; gross_amount?: unknown; signature_key?: unknown },
  serverKey: string,
) {
  const want = createHash("sha512")
    .update(`${String(n.order_id)}${String(n.status_code)}${String(n.gross_amount)}${serverKey}`)
    .digest("hex");
  const got = typeof n.signature_key === "string" ? n.signature_key : "";
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

// ponytail: status provider palsu di memori proses; cukup untuk dev/e2e satu proses `next`.
const fakePaid = new Set<string>();
const fake: PaymentProvider = {
  name: "fake",
  create: async ({ referenceId }) => ({
    ref: `fake_${referenceId}`,
    qrString: `TETRA-FAKE-QRIS:${referenceId}`,
  }),
  status: async (ref) => (fakePaid.has(ref) ? "paid" : "pending"),
  simulate: async (ref) => {
    fakePaid.add(ref);
  },
};

/** Provider aktif, atau null (belum dikonfigurasi → booth menampilkan "hubungi crew"). Palsu tidak pernah di production. */
export function paymentProvider(): PaymentProvider | null {
  if (process.env.PAYMENT_PROVIDER === "fake" && process.env.VERCEL_ENV !== "production")
    return fake;
  // Midtrans dipakai kalau server key-nya diisi (DECISIONS #93); Xendit tetap bisa lewat PAYMENT_PROVIDER=xendit.
  const mt = process.env.MIDTRANS_SERVER_KEY;
  if (mt && process.env.PAYMENT_PROVIDER !== "xendit") return midtrans(mt);
  const key = process.env.XENDIT_SECRET_KEY;
  return key ? xendit(key) : null;
}

/** Pengaturan photobox di events.settings (admin E3): layout = preset + harga. */
export type PhotoboxSettings = {
  layouts: { preset: PresetId; price: number }[];
  extraPrintPrice: number;
};

/** Harga dari DB (aturan 4): paket layout, atau lembar tambahan × harga. null = tidak dijual / di luar batas. */
export function priceFor(
  settings: { photobox?: PhotoboxSettings; maxPrints?: number } | null,
  layoutId: string,
  extraPrints?: number,
): number | null {
  const pb = settings?.photobox;
  const layout = pb?.layouts.find((l) => l.preset === layoutId && l.preset in LAYOUT_PRESETS);
  if (!pb || !layout) return null;
  if (!extraPrints) return layout.price;
  const max = settings?.maxPrints ?? 2;
  if (extraPrints > max - 1 || pb.extraPrintPrice <= 0) return null;
  return extraPrints * pb.extraPrintPrice;
}

type PaymentRow = { id: string; status: string; provider_ref: string | null; expires_at: string };

/**
 * Cek status ke provider lalu simpan (idempotent: hanya dari pending). Dipakai polling booth (cadangan webhook
 * setelah 20 dtk), webhook, dan simulasi. Lewat masa berlaku tanpa lunas → expired.
 */
export async function refreshPayment(p: PaymentRow): Promise<PaymentStatus> {
  if (p.status !== "pending" || !p.provider_ref) return p.status as PaymentStatus;
  const provider = paymentProvider();
  let status: PaymentStatus = "pending";
  try {
    status = provider ? await provider.status(p.provider_ref) : "pending";
  } catch (e) {
    console.warn(`[payments] cek status ${p.id} gagal: ${String(e)}`);
  }
  if (status === "pending" && Date.now() > new Date(p.expires_at).getTime() + 15_000)
    status = "expired";
  if (status === "pending") return status;
  const { data } = await createServiceClient()
    .from("payments")
    .update({ status, ...(status === "paid" && { paid_at: new Date().toISOString() }) })
    .eq("id", p.id)
    .eq("status", "pending")
    .select("status")
    .maybeSingle();
  return (data?.status as PaymentStatus | undefined) ?? status;
}
