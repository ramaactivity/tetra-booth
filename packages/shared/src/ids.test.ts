import { describe, expect, it } from "vitest";
import { newAccessToken, newSessionId, SESSION_ID_PATTERN } from "./ids";

describe("ids", () => {
  it("session id: 10 karakter tanpa karakter mirip", () => {
    for (let i = 0; i < 500; i++) {
      const s = newSessionId();
      expect(s).toHaveLength(10);
      expect(s).toMatch(SESSION_ID_PATTERN);
      expect(s).not.toMatch(/[01OIl]/);
    }
  });
  it("access token: 32 karakter", () => {
    expect(newAccessToken()).toHaveLength(32);
  });
});
