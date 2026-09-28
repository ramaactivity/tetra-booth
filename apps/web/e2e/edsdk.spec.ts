import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { db, hasDb } from "./admin-helpers";

/** DLL Canon EDSDK privat (DECISIONS #112): hanya booth yang dipasangkan; file dari R2 cocok dengan sha256. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

test("edsdk: tanpa token 401; booth dipasangkan dapat URL bertanda tangan & file cocok sha256", async ({
  request,
}) => {
  expect((await request.get("/api/booth/edsdk")).status()).toBe(401);
  const org = (await db.from("organizations").select("id").eq("slug", "tetra").single()).data;
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const { data: dev } = await db
    .from("devices")
    .insert({
      organization_id: org?.id ?? "",
      name: "e2e edsdk",
      short_code: `E2E-${code}`,
      pairing_code: code,
      pairing_expires_at: new Date(Date.now() + 60_000).toISOString(),
    })
    .select("id")
    .single();
  try {
    const pair = await request.post("/api/booth/pair", {
      headers: { "x-forwarded-for": `e2e-eds-${code}` },
      data: { code },
    });
    const { token } = await pair.json();
    const res = await request.get("/api/booth/edsdk", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const m = (await res.json()) as {
      version: string;
      files: { name: string; size: number; sha256: string; url: string }[];
    };
    expect(m.version).toBe("13.20.21");
    expect(m.files.map((f) => f.name)).toEqual(["EDSDK.dll", "EdsImage.dll"]);
    for (const f of m.files) {
      expect(f.url).toContain("X-Amz-Signature");
      const b = Buffer.from(await (await fetch(f.url)).arrayBuffer());
      expect(b.length).toBe(f.size);
      expect(createHash("sha256").update(b).digest("hex")).toBe(f.sha256);
    }
  } finally {
    await db
      .from("devices")
      .delete()
      .eq("id", dev?.id ?? "");
    await db.from("rate_limits").delete().eq("key", `pair:e2e-eds-${code}`);
  }
});
