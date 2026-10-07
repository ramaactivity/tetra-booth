import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { bearerOk, nextOpsSync, OpsWebhookBody, opsDrift, opsSignatureOk } = await import(
  "./ops-sync"
);

const SECRET = "whsec-test";
const sign = (raw: string, t: number, secret = SECRET) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;
const body = (event: string, occurred_at: string, design?: object) =>
  OpsWebhookBody.parse({
    event,
    delivery_id: "7b0d3c1e-1c3a-4f7e-9a51-2a8f0e6d4b11",
    occurred_at,
    booking: { project_id: "PRJ-20261212-0003", client_name: "Rina", design },
  });

describe("Webhook Tetra Ops (kontrak v0.2 §4, #173)", () => {
  const raw = '{"event":"booking.updated"}';
  const now = 1_793_865_600;

  it("tanda tangan sah diterima; body, rahasia, atau t yang diubah ditolak", () => {
    expect(opsSignatureOk(raw, sign(raw, now), SECRET, now)).toBe(true);
    expect(opsSignatureOk(`${raw} `, sign(raw, now), SECRET, now)).toBe(false);
    expect(opsSignatureOk(raw, sign(raw, now, "lain"), SECRET, now)).toBe(false);
    expect(
      opsSignatureOk(raw, sign(raw, now).replace(`t=${now}`, `t=${now + 1}`), SECRET, now),
    ).toBe(false);
    expect(opsSignatureOk(raw, null, SECRET, now)).toBe(false);
    expect(opsSignatureOk(raw, sign(raw, now), "", now)).toBe(false);
  });

  it("menolak kiriman di luar jendela 300 detik", () => {
    expect(opsSignatureOk(raw, sign(raw, now - 300), SECRET, now)).toBe(true);
    expect(opsSignatureOk(raw, sign(raw, now - 301), SECRET, now)).toBe(false);
    expect(opsSignatureOk(raw, sign(raw, now + 301), SECRET, now)).toBe(false);
  });

  it("tanda hanya ditimpa kabar yang lebih baru (urutan kiriman tidak dijamin)", () => {
    const a = nextOpsSync({}, body("booking.updated", "2026-11-02T10:00:00+07:00"));
    expect(a).toEqual({ updated_at: "2026-11-02T10:00:00+07:00" });
    const old = nextOpsSync(a, body("booking.updated", "2026-11-02T09:00:00+07:00"));
    expect(old).toBe(a);
    const c = nextOpsSync(a, body("booking.cancelled", "2026-11-03T08:00:00+07:00"));
    expect(c).toEqual({ ...a, cancelled_at: "2026-11-03T08:00:00+07:00" });
    expect(nextOpsSync(c, body("booking.confirmed", "2026-11-04T08:00:00+07:00"))).toBe(c);
  });

  it("design.approved menyimpan objek desain apa adanya", () => {
    const d = { status: "approved", frame_size: "4R", frame_url: "https://x/y.png" };
    expect(nextOpsSync({}, body("design.approved", "2026-11-02T09:14:05+07:00", d))).toEqual({
      design_approved_at: "2026-11-02T09:14:05+07:00",
      design: d,
    });
  });

  it("body tanpa project_id atau event tak dikenal ditolak", () => {
    const base = {
      delivery_id: "7b0d3c1e-1c3a-4f7e-9a51-2a8f0e6d4b11",
      occurred_at: "2026-11-02T09:14:05+07:00",
    };
    expect(
      OpsWebhookBody.safeParse({ ...base, event: "booking.updated", booking: {} }).success,
    ).toBe(false);
    expect(
      OpsWebhookBody.safeParse({ ...base, event: "booking.deleted", booking: { project_id: "P" } })
        .success,
    ).toBe(false);
  });

  it("Bearer dibandingkan persis", () => {
    expect(bearerOk("Bearer abc", "abc")).toBe(true);
    expect(bearerOk("Bearer abcd", "abc")).toBe(false);
    expect(bearerOk(null, "abc")).toBe(false);
    expect(bearerOk("Bearer ", "")).toBe(false);
  });
});

describe("opsDrift: event Booth vs booking Ops (#176)", () => {
  const ev = {
    event_date: "2026-10-17",
    location: "Gedung A, Bogor",
    scheduled_start: "10:00:00",
    scheduled_end: "13:00:00",
  };
  const b = {
    event_date: "2026-10-17",
    venue_name: "Gedung A",
    venue_city: "Bogor",
    start_time: "10:00",
    end_time: "13:00",
  };
  it("sama = null; booking hilang = missing", () => {
    expect(opsDrift(ev, b)).toBeNull();
    expect(opsDrift(ev, undefined)).toEqual({ kind: "missing" });
  });
  it("pindah tanggal, jam, dan venue terdeteksi dengan nilai Ops", () => {
    expect(
      opsDrift(ev, { ...b, event_date: "2026-10-24", start_time: "15:00", venue_name: "Gedung B" }),
    ).toEqual({
      kind: "changed",
      fields: [
        { field: "date", ops: "2026-10-24" },
        { field: "start", ops: "15:00" },
        { field: "location", ops: "Gedung B, Bogor" },
      ],
    });
  });
  it("jam atau venue kosong di Ops tidak dianggap berubah", () => {
    expect(opsDrift(ev, { ...b, start_time: null, venue_name: null, venue_city: null })).toBeNull();
  });
});
