import { describe, expect, it } from "vitest";
import { HeartbeatRequest, newerVersion } from "./booth-api";

describe("newerVersion", () => {
  it("membandingkan per angka, bukan per teks", () => {
    expect(newerVersion("0.10.0", "0.9.9")).toBe(true);
    expect(newerVersion("0.5.1", "0.5.0")).toBe(true);
    expect(newerVersion("0.5.0", "0.5.0")).toBe(false);
    expect(newerVersion("0.4.9", "0.5.0")).toBe(false);
    expect(newerVersion("1.0.0", "0.99.99")).toBe(true);
  });
});

describe("HeartbeatRequest.status", () => {
  it("menerima snapshot lengkap dan membuang field asing", () => {
    const status = {
      activeEvent: "7c9e6679-7425-40de-944b-e07fc1f90ae8",
      activeEventName: "Andi & Sari",
      camera: { kind: "canon", connected: true, model: "Canon EOS 1500D" },
      printer: { name: "DNP DS-RX1", status: "ready", message: null },
      paper: { remaining: 25, capacity: 700 },
      failedPrints: 1,
      uploadPending: 4,
      lastError: "R2 PUT 503",
      diskFreeGb: 12.5,
    };
    const r = HeartbeatRequest.parse({ appVersion: "0.6.0", status: { ...status, x: 1 } });
    expect(r.status).toEqual(status);
  });
  it("status lama/rusak tidak menolak heartbeat, hanya field itu yang dibuang", () => {
    const r = HeartbeatRequest.parse({
      appVersion: "0.5.39",
      status: {
        activeEvent: "local",
        printer: "ready",
        camera: { uptime: 3, camera: "connected", printer: "ready" },
        paper: { remaining: 12, capacity: 700 },
        uploadPending: -1,
      },
    });
    expect(r.status).toEqual({ activeEvent: "local", paper: { remaining: 12, capacity: 700 } });
    expect(HeartbeatRequest.parse({ appVersion: "x" }).status).toEqual({});
    expect(HeartbeatRequest.parse({ appVersion: "x", status: "rusak" }).status).toEqual({});
    expect(HeartbeatRequest.safeParse({ status: {} }).success).toBe(false);
  });
});
