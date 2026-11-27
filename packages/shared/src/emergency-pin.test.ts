import { describe, expect, it } from "vitest";
import { emergencyPin, isEmergencyPin, tokenHash, wibDay } from "./emergency-pin";

describe("kode darurat PIN crew", () => {
  const token = "tok_contoh";
  const noon = Date.UTC(2026, 10, 27, 5); // 27 Nov 12.00 WIB
  it("server (dari token_hash) dan booth (dari token) menghasilkan kode yang sama", async () => {
    const code = await emergencyPin(await tokenHash(token), wibDay(noon));
    expect(code).toMatch(/^\d{6}$/);
    expect(await isEmergencyPin(token, code, noon)).toBe(true);
    // Sama dengan sha256 hex yang disimpan server (lib/booth.ts).
    expect(await tokenHash("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("berganti per hari WIB, toleransi ±1 hari, token lain ditolak", async () => {
    const hash = await tokenHash(token);
    const today = await emergencyPin(hash, "2026-11-27");
    expect(await emergencyPin(hash, "2026-11-28")).not.toBe(today);
    expect(wibDay(Date.UTC(2026, 10, 27, 17, 30))).toBe("2026-11-28"); // 00.30 WIB
    expect(await isEmergencyPin(token, today, Date.UTC(2026, 10, 28, 5))).toBe(true);
    expect(await isEmergencyPin(token, today, Date.UTC(2026, 10, 30, 5))).toBe(false);
    expect(await isEmergencyPin("tok_lain", today, noon)).toBe(false);
  });
});
