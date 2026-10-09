import { z } from "zod";

/**
 * Guest Cam (#197, docs/PLAN-GUEST-CAM.md): tamu memotret dari HP lewat `/c/{slug}`. Kontrak API publik
 * `/api/c/{token}/…` + setelan per event (`EventSettings.guestCam`).
 */

export const GUEST_CONSENT_DEFAULT =
  "Saya setuju nama dan kontak saya disimpan penyelenggara acara dan Tetra Photobooth untuk mengirim foto dan kabar acara ini.";

export const GuestCamSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  /** Jatah foto per tamu (per HP). */
  shots: z.number().int().min(1).max(50).default(15),
  /** Batas tamu sesuai tier paket (#221); null = tak terbatas. Tamu = HP yang mengirim ≥ 1 foto. */
  maxGuests: z.number().int().min(1).max(100_000).nullable().default(null),
  /** Add-on cetak di lokasi (#223): tiap tamu boleh mencetak satu frame lewat printer booth / Print Station. */
  print: z.boolean().default(false),
  /** Desain kartu QR ukuran kartu nama (#225), dipilih klien di portal Ops atau admin. */
  cardDesign: z.string().max(20).default("zamrud"),
  /** live = foto langsung tampil di album/TV; after = terbuka setelah acara (gaya kamera sekali pakai). */
  reveal: z.enum(["live", "after"]).default("after"),
  /** auto = tampil otomatis (bisa disembunyikan); manual = harus disetujui owner/crew dulu. */
  approval: z.enum(["auto", "manual"]).default("auto"),
  voice: z.boolean().default(true),
  strip: z.boolean().default(true),
  consentText: z.string().min(1).max(600).default(GUEST_CONSENT_DEFAULT),
});
export type GuestCamSettings = z.infer<typeof GuestCamSettingsSchema>;

export const GUEST_VOICE_MAX_SEC = 30;
/** Batas ukuran yang dicek server setelah unggah (HEAD R2); lebih besar = dihapus. */
export const GUEST_MAX_BYTES = { photo: 8_000_000, thumb: 600_000, audio: 2_000_000 } as const;
export const GUEST_MAX_STRIPS = 5;

/** 0812… / +62 812… / 812… → 62812…; sama dengan lead halaman tamu. */
export const WhatsappSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, "").replace(/^0/, "62").replace(/^8/, "628"))
  .pipe(z.string().regex(/^62\d{8,13}$/));
/**
 * Nomor HP tamu (#232): WhatsappSchema + harus nomor seluler Indonesia (628…, 10–13 digit setelah 0) dan bukan nomor
 * asal ketik (semua digit sama, deret 1234567 / 7654321). Nomor dipakai untuk mempertanggungjawabkan foto tamu.
 */
export const GuestWhatsappSchema = WhatsappSchema.pipe(
  z
    .string()
    .regex(/^628[1-9]\d{6,10}$/)
    .refine((n) => {
      const d = n.slice(3);
      return (
        !/^(\d)\1+$/.test(d) &&
        !"01234567890".includes(d.slice(-7)) &&
        !"09876543210".includes(d.slice(-7))
      );
    }),
);
/** "@Nama.Akun" / "instagram.com/nama.akun" → "nama.akun". */
export const InstagramSchema = z
  .string()
  .trim()
  .transform((s) =>
    s
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
      .replace(/^@/, "")
      .replace(/\/.*$/, "")
      .toLowerCase(),
  )
  .pipe(z.string().regex(/^[a-z0-9._]{1,30}$/));

/** POST /api/c/{token}/join: nama + WhatsApp atau Instagram (minimal satu) + persetujuan. */
export const GuestJoinRequest = z
  .object({
    // Nama harus berisi huruf (bukan "..", "123"): tuan rumah perlu tahu siapa yang datang.
    name: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/\p{L}.*\p{L}/u),
    whatsapp: z.string().max(30).optional(),
    instagram: z.string().max(80).optional(),
    consent: z.literal(true),
  })
  .transform((b, ctx) => {
    const wa = b.whatsapp?.trim() ? GuestWhatsappSchema.safeParse(b.whatsapp) : null;
    const ig = b.instagram?.trim() ? InstagramSchema.safeParse(b.instagram) : null;
    if (wa && !wa.success) ctx.addIssue({ code: "custom", path: ["whatsapp"], message: "invalid" });
    if (ig && !ig.success)
      ctx.addIssue({ code: "custom", path: ["instagram"], message: "invalid" });
    // WA wajib (#232): foto tamu bisa dipertanggungjawabkan. IG tetap diterima sebagai tambahan.
    if (!wa) ctx.addIssue({ code: "custom", path: ["whatsapp"], message: "required" });
    return {
      name: b.name,
      whatsapp: wa?.success ? wa.data : undefined,
      instagram: ig?.success ? ig.data : undefined,
    };
  });
export type GuestJoin = z.infer<typeof GuestJoinRequest>;

/**
 * Unggahan tamu. Nomor `idx` dipilih HP (urutan lokal yang disimpan) supaya kirim ulang = menimpa key yang sama
 * (idempoten). Jatah ditegakkan lewat rentang idx: foto 0…shots−1, strip 0…GUEST_MAX_STRIPS−1, suara hanya 0.
 */
export const GuestUploadKind = z.enum(["photo", "strip", "audio"]);
export type GuestUploadKind = z.infer<typeof GuestUploadKind>;
export const GuestAudioType = z.enum(["audio/webm", "audio/mp4"]);

export const GuestSignRequest = z.object({
  kind: GuestUploadKind,
  idx: z.number().int().min(0).max(49),
  audioType: GuestAudioType.optional(),
});
export type GuestSignRequest = z.infer<typeof GuestSignRequest>;
export const GuestSignResponse = z.object({
  uploads: z.array(
    z.object({ part: z.enum(["main", "thumb"]), url: z.url(), contentType: z.string() }),
  ),
});
export type GuestSignResponse = z.infer<typeof GuestSignResponse>;

export const GuestDoneRequest = GuestSignRequest;

const GuestItem = z.object({
  idx: z.number().int(),
  url: z.string(),
  thumbUrl: z.string().optional(),
  /** Moderasi manual: belum disetujui (tamu tetap melihat fotonya sendiri). */
  waiting: z.boolean(),
});
/** GET /api/c/{token}/me (dan respons join/done): isi milik tamu ini. */
export const GuestMe = z.object({
  sessionId: z.string(),
  name: z.string(),
  shotsLeft: z.number().int(),
  /** Idx foto yang sudah tercatat server (HP melewati idx ini saat lanjut). */
  usedIdx: z.array(z.number().int()),
  /** Foto/strip hanya diisi kalau reveal live atau sudah dibuka; `after` = HP cuma lihat hitungan. */
  photos: z.array(GuestItem),
  strips: z.array(GuestItem),
  /** Jumlah strip yang sudah tercatat (termasuk yang disembunyikan), dasar idx strip berikutnya. */
  stripCount: z.number().int(),
  audio: z.boolean(),
  revealed: z.boolean(),
});
export type GuestMe = z.infer<typeof GuestMe>;

/** Aset per unggahan tamu: utama + thumb (foto/strip), atau satu file (suara). */
export const guestParts = (kind: GuestUploadKind, audioType?: string) =>
  kind === "photo"
    ? [
        { part: "main", kind: "original", ext: "jpg", contentType: "image/jpeg" },
        { part: "thumb", kind: "thumb_original", ext: "jpg", contentType: "image/jpeg" },
      ]
    : kind === "strip"
      ? [
          { part: "main", kind: "strip_web", ext: "jpg", contentType: "image/jpeg" },
          { part: "thumb", kind: "thumb_strip", ext: "jpg", contentType: "image/jpeg" },
        ]
      : [
          {
            part: "main",
            kind: "audio",
            ext: audioType === "audio/mp4" ? "m4a" : "webm",
            contentType: audioType === "audio/mp4" ? "audio/mp4" : "audio/webm",
          },
        ];

/** idx masih dalam jatah: foto < shots, strip < 5, suara hanya 0. */
export const idxAllowed = (cam: GuestCamSettings, kind: GuestUploadKind, idx: number) =>
  kind === "photo"
    ? idx < cam.shots
    : kind === "strip"
      ? cam.strip && idx < GUEST_MAX_STRIPS
      : cam.voice && idx === 0;

/** Tier Guest Cam yang dijual (#221, rekap pricing 8 Okt); null = tak terbatas. */
export const GUEST_TIERS = [100, 200, 300, 500, null] as const;
/** Kuota benar-benar berhenti di +10% (tamu asli tidak tertolak di tengah acara). */
export const guestHardCap = (max: number) => Math.ceil(max * 1.1);

/** Status cetak satu tamu (#223), dibaca HP tamu. */
export type GuestPrintStatus = "queued" | "claimed" | "printed" | "failed";
export const GuestPrintRequest = z.object({
  idx: z.number().int().min(0).max(4),
  designId: z.string().max(80),
});
export type GuestPrintInfo = { number: number; status: GuestPrintStatus } | null;

/** Job cetak tamu yang diambil booth (#223). `layout` = layout potong frame; `url` = gambar frame (GET bertanda tangan). */
export const GuestPrintJob = z.object({
  id: z.uuid(),
  number: z.number().int(),
  guestName: z.string().nullable(),
  paper: z.string(),
  layout: z.unknown(),
  url: z.url(),
});
export type GuestPrintJob = z.infer<typeof GuestPrintJob>;
export const GuestPrintClaim = z.object({ jobs: z.array(GuestPrintJob) });
export const GuestPrintResult = z.object({
  status: z.enum(["printed", "failed"]),
  error: z.string().max(300).optional(),
});
