import { describe, expect, it } from "vitest";
import { CommandSchema, ReplySchema, ServiceMessageSchema } from "./camera-protocol";

describe("camera protocol", () => {
  it("parse perintah capture", () => {
    const r = CommandSchema.safeParse({
      id: "1",
      type: "capture",
      payload: { sessionId: "abc", index: 0, outputDir: "C:/x" },
    });
    expect(r.success).toBe(true);
  });
  it("tolak print.submit dengan paper tidak dikenal", () => {
    const r = CommandSchema.safeParse({
      id: "1",
      type: "print.submit",
      payload: { jobId: "j", path: "p", copies: 1, paper: "A4" },
    });
    expect(r.success).toBe(false);
  });
  it("balasan health dan error dikenali", () => {
    expect(
      ReplySchema.safeParse({
        id: "1",
        type: "system.health",
        payload: { uptime: 3, camera: "connected", printer: "ready" },
      }).success,
    ).toBe(true);
    expect(
      ReplySchema.safeParse({ id: "1", type: "error", payload: { code: "E", message: "x" } })
        .success,
    ).toBe(true);
  });
  it("event tanpa id dikenali sebagai pesan service", () => {
    const r = ServiceMessageSchema.safeParse({ type: "print.done", payload: { jobId: "j" } });
    expect(r.success).toBe(true);
    expect(ServiceMessageSchema.safeParse({ type: "nope", payload: {} }).success).toBe(false);
  });
});
