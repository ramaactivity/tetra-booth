"use server";
import type { Json } from "@tetra/db";
import { newAccessToken } from "@tetra/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { copyLayout } from "@/lib/layouts";
import type { OpsSync } from "@/lib/ops-sync";
import { requireMember } from "@/lib/supabase/server";
import { spotOf } from "@/lib/tetra-ops";
import { assignToEvent } from "../../templates/assign";

/** Preset bawaan per ukuran frame (#262); admin bisa ganti desainnya nanti di Pengaturan / Pasang desain Ops. */
const PRESET = { "2R": "strip-3", "4R": "4r-grid", polaroid: "polaroid-1" } as const;
const PAPER = { "2R": "2x6x2", "4R": "4R", polaroid: "3x4x2" } as const;

const Unit = z.object({
  eventId: z.uuid(),
  spot: z.number().int().min(2).max(10),
  size: z.enum(["2R", "4R", "polaroid"]),
  deviceId: z.uuid().nullable(),
});

/**
 * Acara multi-unit (#262, kontrak Ops §2.2: satu event Booth per unit karena satu event = satu kertas): buat event
 * unit ke-N dari event unit 1. Nama, tanggal, lokasi, paket, booking Ops, branding & pengaturan disalin; desain =
 * preset ukuran pilihan; nomor unit di `ops_sync.spot` (nama tetap sama, jadi cetakan tidak memuat "Spot 2").
 * Snapbook (Guest Cam) hanya di unit 1 supaya tamu tidak mendapat dua QR. Laptop opsional: dikunci ke laptop itu.
 */
export async function createUnitEvent(
  input: z.input<typeof Unit>,
): Promise<{ ok: true; slug: string } | { ok: false; message: string }> {
  const { db, orgId, user } = await requireMember(["owner", "admin"]);
  const p = Unit.safeParse(input);
  if (!p.success) return { ok: false, message: "Pilih ukuran frame dulu" };
  const { eventId, spot, size, deviceId } = p.data;
  const { data: src } = await db
    .from("events")
    .select(
      "id, name, event_date, mode, location, branding, settings, lead_capture, ops_project_id, ops_sync, package_name, package_hours, scheduled_start, scheduled_end, client_instagram",
    )
    .eq("id", eventId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!src?.ops_project_id)
    return { ok: false, message: "Event ini tidak terhubung ke booking Ops" };

  // Unit yang sama sudah dibuat (klik dua kali / tab lain): kembalikan event itu, jangan dobel.
  const { data: siblings } = await db
    .from("events")
    .select("slug, name, ops_sync")
    .eq("organization_id", orgId)
    .eq("ops_project_id", src.ops_project_id);
  const dup = (siblings ?? []).find((e) => spotOf(e) === spot);
  if (dup) return { ok: true, slug: dup.slug };

  const settings = (src.settings ?? {}) as Record<string, unknown> & {
    guestCam?: Record<string, unknown>;
  };
  const { data: ev, error } = await db
    .from("events")
    .insert({
      organization_id: orgId,
      name: src.name,
      event_date: src.event_date,
      mode: src.mode,
      location: src.location,
      branding: src.branding,
      lead_capture: src.lead_capture,
      settings: { ...settings, guestCam: { ...settings.guestCam, enabled: false } },
      ops_project_id: src.ops_project_id,
      ops_frame_size: size,
      ops_sync: { spot } satisfies OpsSync,
      package_name: src.package_name,
      package_hours: src.package_hours,
      scheduled_start: src.scheduled_start,
      scheduled_end: src.scheduled_end,
      client_instagram: src.client_instagram,
      status: "ready",
      created_by: user.id,
      // Sama dengan wizard (#249): galeri klien, live, & galeri publik tamu langsung aktif.
      client_token: newAccessToken(),
      live_token: newAccessToken(),
      public_gallery: true,
      all_devices: !deviceId,
    })
    .select("id, slug")
    .single();
  if (error || !ev) return { ok: false, message: "Gagal membuat event unit, coba lagi" };
  const drop = () => db.from("events").delete().eq("id", ev.id).eq("organization_id", orgId);
  if (deviceId)
    await db
      .from("event_devices")
      .insert({ organization_id: orgId, event_id: ev.id, device_id: deviceId });

  const layout = await copyLayout(
    db,
    orgId,
    PRESET[size],
    () => `${src.name} · Unit ${spot} ${size}`,
    "event",
  );
  const r = layout
    ? await assignToEvent(db, orgId, { id: layout, paper: PAPER[size] }, ev.id)
    : { ok: false, message: "Gagal membuat desain" };
  if (!r.ok) {
    await drop();
    return { ok: false, message: r.message };
  }

  // Unit 1 ditandai juga, supaya label "Unit 1" tampil di daftar & desain Ops level atas terpasang di sana.
  const srcSync = (src.ops_sync ?? {}) as OpsSync;
  if (!srcSync.spot)
    await db
      .from("events")
      .update({ ops_sync: { ...srcSync, spot: spotOf(src) } as unknown as NonNullable<Json> })
      .eq("id", src.id)
      .eq("organization_id", orgId);
  revalidatePath("/admin");
  return { ok: true, slug: r.slug ?? ev.slug };
}

/** Kunci event unit ke satu laptop (atau lepas ke semua laptop), supaya crew tidak memilih event unit lain. */
export async function setUnitDevice(eventId: string, deviceId: string | null) {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const id = z.uuid().parse(eventId);
  const dev = z.uuid().nullable().parse(deviceId);
  await db.from("event_devices").delete().eq("event_id", id).eq("organization_id", orgId);
  if (dev)
    await db.from("event_devices").insert({ organization_id: orgId, event_id: id, device_id: dev });
  await db.from("events").update({ all_devices: !dev }).eq("id", id).eq("organization_id", orgId);
  revalidatePath("/admin/(app)/events/[id]", "layout");
}
