import { describe, expect, it } from "vitest";
import { CloudError, cloudErrorText } from "./cloud-error";

const OFF = "Link galeri butuh internet.";

describe("pesan error cloud untuk crew (#170)", () => {
  it("offline / timeout = butuh internet", () => {
    expect(cloudErrorText(new TypeError("fetch failed"), OFF)).toBe(OFF);
    expect(cloudErrorText(new DOMException("timeout", "TimeoutError"), OFF)).toBe(OFF);
  });
  it("ditolak server = alasan sebenarnya", () => {
    expect(cloudErrorText(new CloudError("x", 401), OFF)).toMatch(/dipasangkan ulang/);
    expect(cloudErrorText(new CloudError("x", 404), OFF)).toMatch(
      /^Booth ini tidak ditugaskan ke event ini\. Minta admin menugaskan booth ini di Pengaturan event/,
    );
    expect(cloudErrorText(new CloudError("x", 503), OFF)).toMatch(/^Server sedang bermasalah/);
    expect(cloudErrorText(new CloudError("x", 409), OFF)).toMatch(/kode 409/);
  });
});
