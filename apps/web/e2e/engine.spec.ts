import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/** Kriteria Fase 0: hash render di browser = hash snapshot Node (= hash Electron). */
const snap = readFileSync(
  join(__dirname, "../../../packages/template-engine/test/__snapshots__/render.test.ts.snap"),
  "utf8",
);
const expected = /4R: hash piksel[\s\S]*?"([0-9a-f]{64})"/.exec(snap)?.[1];

test("template engine render identik di browser", async ({ page }) => {
  expect(expected).toBeTruthy();
  await page.goto("/dev/engine");
  const hash = page.getByTestId("hash");
  await expect(hash).toHaveText(/^[0-9a-f]{64}$/);
  await expect(hash).toHaveText(expected ?? "");
});
