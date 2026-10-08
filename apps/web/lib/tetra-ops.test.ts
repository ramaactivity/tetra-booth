import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { approvedDesign, OpsBooking, opsInstagram } = await import("./tetra-ops");

const base = {
  project_id: "PRJ-1",
  client_name: "Rina",
  event_category: "wedding",
  event_date: "2026-12-12",
  start_time: "10:00",
  end_time: "13:00",
  venue_name: null,
  venue_city: null,
  service_type: null,
  frame_size: "4R",
  package_name: "Photobooth",
  package_duration_hours: 3,
};

describe("approvedDesign (#177)", () => {
  const b = OpsBooking.parse({
    ...base,
    portal_url: `https://booking.tetraphoto.com/akun/booking/${"x".repeat(300)}`,
    design: {
      status: "approved",
      approved_at: "2026-11-02T09:14:00+07:00",
      frame_size: "4R",
      orientation: "portrait",
      frame_url: "https://x/spot1.png",
      spots: [
        { spot_no: 2, frame_size: "2R", orientation: "portrait", frame_url: "https://x/spot2.png" },
      ],
    },
  });
  it("spot 1 dari level atas, spot N dari spots[]", () => {
    expect(approvedDesign(b, "Wedding Rina")?.frameUrl).toBe("https://x/spot1.png");
    expect(approvedDesign(b, "Wedding Rina · Spot 2")).toMatchObject({
      frameUrl: "https://x/spot2.png",
      frameSize: "2R",
    });
    expect(approvedDesign(b, "Wedding Rina · Spot 3")).toBeNull();
  });
  it("belum ACC, tanpa desain, atau tanpa file = null", () => {
    expect(
      approvedDesign(OpsBooking.parse({ ...base, design: { status: "proses" } }), "x"),
    ).toBeNull();
    expect(approvedDesign(OpsBooking.parse(base), "x")).toBeNull();
    expect(approvedDesign(undefined, "x")).toBeNull();
  });
});

it("opsInstagram: @/link/huruf besar dibersihkan, duplikat & isian rusak dilewati, maks. 6", () => {
  expect(
    opsInstagram([
      "@Dimas.Rina",
      "https://instagram.com/wo.bahagia/",
      "dimas.rina",
      "bad handle!",
      5,
    ]),
  ).toEqual(["dimas.rina", "wo.bahagia"]);
  expect(opsInstagram(null)).toEqual([]);
  expect(opsInstagram(["a1", "a2", "a3", "a4", "a5", "a6", "a7"])).toHaveLength(6);
});
