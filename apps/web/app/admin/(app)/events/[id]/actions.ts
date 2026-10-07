"use server";
import { applyRun, type EventRun, RUN_ACTIONS, setRunTimes } from "@tetra/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteObjects } from "@/lib/r2";
import { updateRun } from "@/lib/run";
import { requireMember } from "@/lib/supabase/server";

/**
 * Moderasi sesi (FSD §5, desain E8): sembunyikan/tampilkan, hapus (foto di R2 ikut dihapus), atau "Bukan tes"
 * (sesi tes booth #153 jadi sesi asli). Owner/admin; semua aksi masuk audit_logs.
 */
export async function moderate(
  eventId: string,
  sessionId: string,
  action: "hide" | "show" | "delete" | "untest",
) {
  const { db, orgId, user } = await requireMember(["owner", "admin"]);
  const scope = db
    .from("sessions")
    .update(
      action === "delete"
        ? { deleted_at: new Date().toISOString() }
        : action === "untest"
          ? { is_test: false }
          : { hidden_at: action === "hide" ? new Date().toISOString() : null },
    );
  const { data } = await scope
    .eq("id", sessionId)
    .eq("event_id", eventId)
    .eq("organization_id", orgId)
    .select("id")
    .maybeSingle();
  if (!data) return;
  if (action === "delete") {
    const { data: assets } = await db
      .from("assets")
      .select("r2_key")
      .eq("session_id", sessionId)
      .eq("organization_id", orgId);
    await deleteObjects((assets ?? []).map((a) => a.r2_key.split("#")[0] ?? a.r2_key));
    await db.from("assets").delete().eq("session_id", sessionId).eq("organization_id", orgId);
  }
  await db.from("audit_logs").insert({
    organization_id: orgId,
    actor_user_id: user.id,
    action: `session.${action}`,
    target: sessionId,
    meta: { eventId },
  });
  revalidatePath("/admin/(app)/events/[id]", "layout");
}

export type RunResult = { ok: true; run: EventRun } | { ok: false; message: string };

/** Timer event dari dashboard (DECISIONS #149): Mulai/Lanjutkan, Jeda, Selesai. Owner/admin. */
export async function runEvent(eventId: string, action: string): Promise<RunResult> {
  const { db, orgId, user } = await requireMember(["owner", "admin"]);
  const a = z.enum(RUN_ACTIONS).safeParse(action).data;
  if (!a || !z.uuid().safeParse(eventId).success)
    return { ok: false, message: "Aksi tidak dikenal" };
  const now = Date.now();
  const run = await updateRun(db, eventId, orgId, (r) =>
    applyRun(r, a, new Date(now).toISOString(), now),
  ).catch(() => null);
  if (!run) return { ok: false, message: "Gagal menyimpan, coba lagi" };
  await db.from("audit_logs").insert({
    organization_id: orgId,
    actor_user_id: user.id,
    action: `run.${a}`,
    target: eventId,
  });
  revalidatePath("/admin/(app)/events/[id]", "layout");
  return { ok: true, run };
}

/** Koreksi manual jam mulai / selesai (ISO). `end` kosong = jam selesai tidak diubah. */
export async function correctRun(
  eventId: string,
  start: string,
  end: string | null,
): Promise<RunResult> {
  const { db, orgId, user } = await requireMember(["owner", "admin"]);
  const Iso = z.iso.datetime();
  if (
    !z.uuid().safeParse(eventId).success ||
    !Iso.safeParse(start).success ||
    (end !== null && !Iso.safeParse(end).success)
  )
    return { ok: false, message: "Jam tidak valid" };
  const run = await updateRun(db, eventId, orgId, (r) =>
    setRunTimes(r, start, end, Date.now()),
  ).catch(() => null);
  if (!run)
    return {
      ok: false,
      message: "Jam selesai harus setelah jam mulai, dan tidak bertabrakan dengan jeda.",
    };
  await db.from("audit_logs").insert({
    organization_id: orgId,
    actor_user_id: user.id,
    action: "run.correct",
    target: eventId,
    meta: { start, end },
  });
  revalidatePath("/admin/(app)/events/[id]", "layout");
  return { ok: true, run };
}

/**
 * Moderasi Guest Cam (desain E15, #203): setujui (review_status null → tampil di album & TV) atau tolak foto/strip
 * tamu. Banyak sekaligus (Shift+klik / pilih semua). Owner/admin; masuk audit_logs.
 */
export async function reviewGuest(
  eventId: string,
  assetIds: string[],
  decision: "approve" | "reject",
) {
  const { db, orgId, user } = await requireMember(["owner", "admin"]);
  const ids = z.array(z.uuid()).max(500).safeParse(assetIds).data;
  if (!ids?.length || !z.uuid().safeParse(eventId).success) return;
  const { data: rows } = await db
    .from("assets")
    .select("id, kind, idx, session_id, sessions!inner(event_id, source)")
    .eq("organization_id", orgId)
    .eq("sessions.event_id", eventId)
    .eq("sessions.source", "guest")
    .in("id", ids);
  const review_status = decision === "approve" ? null : "rejected";
  // Thumb ikut status asetnya (galeri memakai thumb).
  for (const a of rows ?? []) {
    const thumb = a.kind === "strip_web" ? "thumb_strip" : "thumb_original";
    await db
      .from("assets")
      .update({ review_status })
      .eq("organization_id", orgId)
      .eq("session_id", a.session_id)
      .eq("idx", a.idx)
      .in("kind", [a.kind, thumb]);
  }
  await db.from("audit_logs").insert({
    organization_id: orgId,
    actor_user_id: user.id,
    action: `guest.${decision}`,
    target: eventId,
    meta: { count: rows?.length ?? 0 },
  });
  revalidatePath("/admin/(app)/events/[id]", "layout");
}

/** "Buka foto sekarang" (E15): reveal Guest Cam mode setelah acara dibuka sebelum acara dihentikan. */
export async function revealGuest(eventId: string) {
  const { db, orgId, user } = await requireMember(["owner", "admin"]);
  if (!z.uuid().safeParse(eventId).success) return;
  await db
    .from("events")
    .update({ guest_revealed_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("organization_id", orgId);
  await db.from("audit_logs").insert({
    organization_id: orgId,
    actor_user_id: user.id,
    action: "guest.reveal",
    target: eventId,
  });
  revalidatePath("/admin/(app)/events/[id]", "layout");
}
