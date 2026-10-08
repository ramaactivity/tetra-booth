import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, type Page, test } from "@playwright/test";

/**
 * Cetak tamu Guest Cam di printer booth (#223) terhadap server cloud palsu: booth yang tersambung & event dengan
 * add-on cetak mengambil job untuk kertasnya (2x6x2), menyusun satu lembar berisi dua tamu, mencetak lewat antrean
 * yang sama dengan sesi, lalu melaporkan "printed". Chip "Cetak Guest Cam #1 Sari · #2 Budi" tampil untuk crew.
 */
const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;
// PNG 1×1 sebagai frame tamu (ukuran tidak penting untuk alur).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const STRIP = {
  id: "l-strip",
  version: 1,
  paper: "2x6x2",
  canvas: { width: 600, height: 1800, dpi: 300 },
  background: { color: "#ffffff" },
  slots: [{ id: "a", x: 40, y: 40, w: 520, h: 520, fit: "cover", z: "below_overlay" }],
  texts: [],
};
const typePin = async (w: Page, pin: string) => {
  for (const d of pin) await w.getByRole("button", { name: d, exact: true }).click();
  await w.getByRole("button", { name: "OK" }).click();
};

test("booth mencetak cetak tamu Guest Cam berpasangan dan melapor", async () => {
  test.setTimeout(120_000);
  const data = mkdtempSync(join(tmpdir(), "tb-gprint-"));
  const dir = join(data, "events", "gc-print", "bundle");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "config.json"),
    JSON.stringify({
      id: "gc-print",
      name: "Uji Cetak Tamu",
      date: "8 Oktober 2026",
      layout: STRIP,
      settings: { guestCam: { enabled: true, strip: true, print: true } },
    }),
  );
  let served = false;
  const claims: { url: string; paper: string }[] = [];
  const reports: { id: string; status: string }[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      const url = req.url ?? "";
      if (url === "/api/booth/pair") {
        res.end(
          JSON.stringify({
            token: "t".repeat(54),
            deviceId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
            name: "Booth Uji",
            shortCode: "B07",
          }),
        );
      } else if (url.endsWith("/guest-prints")) {
        claims.push({ url, paper: JSON.parse(body).paper });
        const job = (n: number, name: string) => ({
          id: `00000000-0000-4000-8000-00000000000${n}`,
          number: n,
          guestName: name,
          paper: "2x6x2",
          layout: STRIP,
          url: `http://127.0.0.1:${port}/frame/${n}`,
        });
        res.end(JSON.stringify({ jobs: served ? [] : [job(1, "Sari"), job(2, "Budi")] }));
        served = true;
      } else if (url.startsWith("/frame/")) {
        res.setHeader("content-type", "image/png");
        res.end(PNG);
      } else if (url.startsWith("/api/booth/guest-prints/")) {
        reports.push({ id: url.split("/").at(-1) ?? "", status: JSON.parse(body).status });
        res.end(JSON.stringify({ ok: true }));
      } else if (url === "/api/booth/events") {
        res.end(JSON.stringify({ events: [] }));
      } else {
        res.end(JSON.stringify({ ok: true }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TETRA_GUEST_URL: `http://127.0.0.1:${port}`,
    TETRA_NO_SHELL_OPEN: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [appDir, "--camera=simulated", "--no-spawn", `--data=${data}`, "--use-mock-keychain"],
    env: env as Record<string, string>,
  });
  try {
    const w = await app.firstWindow();
    await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();
    // Sambungkan ke akun Tetra lewat menu crew (PIN baru 2468).
    for (let i = 0; i < 5; i++) await w.getByTestId("crew-hotspot").click();
    await typePin(w, "2468");
    await typePin(w, "2468");
    await w.getByTestId("step-pair").getByRole("button", { name: "Sambungkan" }).click();
    await typePin(w, "123456");
    await expect(w.getByTestId("pair-device")).toContainText("Booth Uji");
    await w.getByRole("button", { name: /Lanjut: Pilih Event/ }).click();
    await w.getByRole("button", { name: /Mode Event/ }).click();
    await w.getByRole("button", { name: /Uji Cetak Tamu/ }).click();
    // Pencetak jalan juga di mode crew: satu lembar untuk dua tamu, lalu dilaporkan.
    await expect(w.getByTestId("guest-print-chip")).toHaveText(
      "Cetak Guest Cam #1 Sari · #2 Budi",
      {
        timeout: 30_000,
      },
    );
    await expect.poll(() => reports, { timeout: 30_000 }).toHaveLength(2);
    expect(reports.map((r) => r.status)).toEqual(["printed", "printed"]);
    expect(claims[0]).toMatchObject({
      url: "/api/booth/events/gc-print/guest-prints",
      paper: "2x6x2",
    });
    const sid = readdirSync(join(data, "sessions")).find((d) => !d.startsWith("_")) ?? "";
    const sheet = join(data, "sessions", sid, "out", "guest-print.jpg");
    expect(existsSync(sheet)).toBe(true);
    const size = await app.evaluate(
      ({ nativeImage }, f) => nativeImage.createFromPath(f).getSize(),
      sheet,
    );
    expect([size.width, size.height]).toEqual([1200, 1800]);
  } finally {
    await app.close();
    server.close();
  }
});
