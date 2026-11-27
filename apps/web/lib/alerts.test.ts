import { describe, expect, it } from "vitest";
import { boothAlerts } from "./alerts";

const T = Date.parse("2026-11-27T12:00:00+07:00"); // Jumat 12.00 WIB
const running = { segments: [{ start: "2026-11-27T02:00:00Z" }] };
const ev = (o: Partial<Parameters<typeof boothAlerts>[1][number]> = {}) => ({
  id: "e1",
  name: "Wedding A",
  event_date: "2026-11-27",
  run: running,
  client_token: null,
  client_expires_at: null,
  ...o,
});
const dev = (o: Partial<Parameters<typeof boothAlerts>[0][number]> = {}) => ({
  id: "d1",
  name: "Booth Rama",
  short_code: "B02",
  last_seen_at: new Date(T - 30_000).toISOString(),
  status: { activeEvent: "e1", paper: { remaining: 20, capacity: 700 } },
  ...o,
});

describe("boothAlerts", () => {
  it("kertas menipis hanya saat acara jalan", () => {
    const a = boothAlerts([dev()], [ev()], T);
    expect(a.map((x) => x.id)).toEqual(["paper_low:d1:e1"]);
    expect(a[0]?.text).toContain("tinggal 20 lembar");
    expect(a[0]?.text.length).toBeLessThanOrEqual(300);
    expect(boothAlerts([dev()], [ev({ run: { segments: [] } })], T)).toEqual([]);
  });
  it("booth offline > 10 menit saat acara jalan; < 10 menit belum", () => {
    const last = new Date(T - 15 * 60_000).toISOString();
    const a = boothAlerts([dev({ last_seen_at: last })], [ev()], T);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: "booth_offline", id: `booth_offline:d1:e1:${last}` });
    expect(a[0]?.text).toContain("15 menit");
    const soon = new Date(T - 5 * 60_000).toISOString();
    expect(boothAlerts([dev({ last_seen_at: soon })], [ev()], T)).toEqual([]);
  });
  it("foto belum terkirim setelah acara & galeri hampir berakhir: hanya 08.00–21.00 WIB", () => {
    const done = ev({
      event_date: "2026-11-25",
      run: { segments: [] },
      client_token: "x",
      client_expires_at: "2026-11-29T00:00:00+07:00",
    });
    const d = dev({
      status: { activeEvent: "e9", uploadsByEvent: [{ eventId: "e1", sessions: 3, files: 9 }] },
    });
    const day = boothAlerts([d], [done], T);
    expect(day.map((x) => x.kind).sort()).toEqual(["gallery_expiring", "unsent"]);
    expect(day.find((x) => x.kind === "unsent")?.text).toContain("3 sesi masih di laptop");
    expect(day.find((x) => x.kind === "gallery_expiring")?.text).toContain(
      "belum pernah membukanya",
    );
    const night = Date.parse("2026-11-27T22:30:00+07:00");
    expect(boothAlerts([d], [done], night)).toEqual([]);
  });
});
