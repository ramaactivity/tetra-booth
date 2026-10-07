import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

/**
 * Polaroid dua sisi berbeda (#207): 1 slot desain, `pairDifferent` → sesi memotret 2 foto, lembar 4R berisi dua
 * potong berbeda, dan GIF ikut jadi (≥ 2 foto). Kamera simulasi, tanpa Camera Service.
 */
const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;

test("polaroid dua sisi berbeda: 2 foto, 2 potong, GIF ada", async () => {
  test.setTimeout(120_000);
  const data = mkdtempSync(join(tmpdir(), "tb-pair-"));
  const dir = join(data, "events", "polaroid", "bundle");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "config.json"),
    JSON.stringify({
      id: "polaroid",
      name: "Uji Polaroid",
      date: "7 Oktober 2026",
      layout: {
        id: "l-pol",
        version: 1,
        paper: "3x4x2",
        canvas: { width: 900, height: 1200, dpi: 300 },
        background: { color: "#ffffff" },
        slots: [{ id: "s", x: 50, y: 50, w: 800, h: 800, fit: "cover", z: "below_overlay" }],
        texts: [],
      },
      settings: { pairDifferent: true, filters: [] },
    }),
  );
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [
      appDir,
      "--camera=simulated",
      "--no-spawn",
      "--start-screen",
      "--size=1920x1080",
      `--data=${data}`,
    ],
    env: env as Record<string, string>,
  });
  try {
    const w = await app.firstWindow();
    await w.getByRole("button", { name: /Mode Event/ }).click();
    await w.getByRole("button", { name: /Uji Polaroid/ }).click();
    const start = w.getByRole("button", { name: /sentuh untuk mulai/i });
    await expect(start).toBeVisible();
    await w.waitForTimeout(1000);
    await start.click();
    await w.getByRole("button", { name: /pakai semua foto/i }).click({ timeout: 45_000 });
    await w.getByRole("button", { name: /cetak sekarang/i }).click({ timeout: 15_000 });
    await w.getByRole("button", { name: "Selesai" }).click({ timeout: 60_000 });
    const sid = readdirSync(join(data, "sessions")).find((d) => !d.startsWith("_")) ?? "";
    const out = join(data, "sessions", sid, "out");
    await expect.poll(() => existsSync(join(out, "animation.gif")), { timeout: 30_000 }).toBe(true);
    expect(readdirSync(out)).toEqual(
      expect.arrayContaining(["original_1.jpg", "original_2.jpg", "strip.jpg"]),
    );
    const size = await app.evaluate(
      ({ nativeImage }, f) => nativeImage.createFromPath(f).getSize(),
      join(out, "strip.jpg"),
    );
    expect([size.width, size.height]).toEqual([1200, 1800]);
  } finally {
    await app.close();
  }
});
