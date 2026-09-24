import "server-only";
import { LAYOUT_PRESETS, type PaymentStatus, type PresetId } from "@tetra/shared";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Pembayaran QRIS photobox (TSD §8, DECISIONS #70). `PaymentProvider` supaya provider lain / voucher bisa ditambah.
 * Xendit Payment Requests API (QR_CODE / QRIS). Harga selalu dari pengaturan event di DB, tidak pernah dari booth.
 */
export interface PaymentProvider {
  name: string;
  create(p: { referenceId: string; amount: number; expiresAt: Date }): Promise<{
    ref: string;
    qrString: string;
  }>;
  status(ref: string): Promise<PaymentStatus>;
  /** Uji: bayar tagihan tanpa dompet digital (hanya mode test Xendit / provider palsu). */
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
