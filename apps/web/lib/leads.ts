import { createHash } from "node:crypto";
import { WhatsappSchema } from "@tetra/shared";
import { z } from "zod";

/**
 * Lead capture (FSD §2, DECISIONS #71): events.lead_capture. Semua field yang dipilih wajib diisi; persetujuan
 * disimpan dengan versi teks (hash) supaya bisa dibuktikan teks mana yang disetujui (UU PDP, TSD §12).
 */
export const LEAD_FIELDS = ["name", "whatsapp", "email"] as const;
export type LeadField = (typeof LEAD_FIELDS)[number];

const Config = z.object({
  enabled: z.literal(true),
  mode: z.enum(["gate", "optional"]),
  fields: z.array(z.enum(LEAD_FIELDS)).min(1),
  consentText: z.string().min(1).max(600),
  consentVersion: z.string().min(1),
});
export type LeadCapture = z.infer<typeof Config>;

/** Pengaturan aktif, atau null (mati / belum diatur / rusak). */
export const leadCapture = (raw: unknown): LeadCapture | null => {
  const r = Config.safeParse(raw);
  return r.success ? r.data : null;
};

export const consentVersion = (text: string) =>
  createHash("sha256").update(text).digest("hex").slice(0, 10);

export const LEAD_VALUE: Record<LeadField, z.ZodType<string>> = {
  name: z.string().trim().min(2).max(80),
  whatsapp: WhatsappSchema,
  email: z.string().trim().toLowerCase().pipe(z.email()),
};
