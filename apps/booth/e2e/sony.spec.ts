import { existsSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

/**
 * Sony Camera Remote Command lewat Camera Service (DECISIONS #169) dengan kamera palsu tingkat PTP (`--sony fake` =
 * A7 III v2, `fake-v3` = A7 IV). S1: handshake sampai tersambung + model. Butuh `dotnet build services/camera`.
 */

const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;
const serviceBin = join(
  appDir,
  "../../services/camera/TetraCamera.Host/bin/Debug/net10.0",
  process.platform === "win32" ? "TetraCamera.exe" : "TetraCamera",
);

for (const [fake, model] of [
  ["fake", "ILCE-7M3"],
  ["fake-v3", "ILCE-7M4"],
] as const) {
  test(`sony (${fake}): Camera Service tersambung ke ${model}`, async () => {
    test.skip(!existsSync(serviceBin), "Camera Service belum di-build");
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({
      executablePath: electronPath,
      args: [
        appDir,
        "--camera=sony",
        `--sony=${fake}`,
        `--data=${mkdtempSync(join(tmpdir(), "tb-sony-"))}`,
      ],
      env: env as Record<string, string>,
    });
    try {
      const w = await app.firstWindow();
      await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();
      await expect
        .poll(
          () =>
            w.evaluate(async () => {
              const s = await (
                window as unknown as {
                  tetra: { cameraStatus(): Promise<{ connected: boolean; model: string | null }> };
                }
              ).tetra
                .cameraStatus()
                .catch(() => null);
              return s?.connected ? s.model : null;
            }),
          { timeout: 15_000 },
        )
        .toBe(model);
    } finally {
      await app.close();
    }
  });
}
