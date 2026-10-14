import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, type Page, test } from "@playwright/test";

/**
 * Boomerang dari live view (opsional per event) dengan Canon palsu lewat Camera Service + cloud palsu:
 * nyala → aset `video` idx 1 (MP4) ikut diunggah, sesi tetap selesai, live view tetap mengalir di foto 2 & 3 (#269).
 * Mati → tidak ada aset boomerang. Waktu jepret → layar foto dicatat untuk kedua mode (dampak performa).
 */

const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;
const serviceBin = join(
  appDir,
  "../../services/camera/TetraCamera.Host/bin/Debug/net10.0",
  process.platform === "win32" ? "TetraCamera.exe" : "TetraCamera",
);
const EVENT = "5b1e2d3f-0a7b-4f1c-9d4e-2b3c4d5e6f71";
const TOKEN = "e".repeat(54);
const slot = (id: string, y: number) =>
  ({ id, x: 30, y, w: 540, h: 360, fit: "cover", z: "below_overlay" }) as const;
const config = (boomerang: boolean) => ({
  id: EVENT,
  name: "Uji Boomerang",
  date: "16 Oktober 2026",
  layout: {
    id: "strip-3-boom",
    version: 1,
    paper: "2x6x2",
    canvas: { width: 600, height: 1800, dpi: 300 },
    background: { color: "#ffffff" },
    slots: [0, 1, 2].map((i) => slot(`s${i}`, 30 + i * 390)),
    texts: [],
  },
  settings: { countdownSec: 2, mirrorSec: 0, shotDelaySec: 1, maxPrints: 3, boomerang },
});

const typePin = async (w: Page, pin: string) => {
  for (const d of pin) await w.getByRole("button", { name: d, exact: true }).click();
  await w.getByRole("button", { name: "OK" }).click();
};

type Done = {
  name: string;
  signed: string[];
  puts: Map<string, Buffer>;
  w: Page;
  log: () => string[];
};

const CANON = ["--camera=canon", "--canon=fake"];
/** Webcam palsu Chromium: pola bergerak + jam, jadi maju-mundur boomerang terlihat di frame. */
const WEBCAM = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  "--camera=webcam",
  "--no-spawn",
];

async function runSession(boomerang: boolean, after: (d: Done) => Promise<void>, camera = CANON) {
  const sessions: Record<string, unknown>[] = [];
  const signed: string[] = [];
  const puts = new Map<string, Buffer>();
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      res.setHeader("content-type", "application/json");
      const url = req.url ?? "";
      if (url === "/api/booth/pair")
        return res.end(
          JSON.stringify({
            token: TOKEN,
            deviceId: randomUUID(),
            name: "Booth Uji",
            shortCode: "B09",
          }),
        );
      if (url === "/api/booth/events")
        return res.end(
          JSON.stringify({ events: [{ id: EVENT, name: "Uji Boomerang", bundleVersion: 1 }] }),
        );
      if (url === `/api/booth/events/${EVENT}/bundle`)
        return res.end(JSON.stringify({ bundleVersion: 1, config: config(boomerang), files: [] }));
      if (url === "/api/booth/sessions") sessions.push(JSON.parse(String(body)));
      if (url.startsWith("/put/")) puts.set(url.slice(5), body);
      if (url === "/api/booth/uploads/sign") {
        const assets: { kind: string; idx: number }[] = JSON.parse(String(body)).assets;
        for (const a of assets) signed.push(`${a.kind}:${a.idx}`);
        return res.end(
          JSON.stringify({
            uploads: assets.map((a) => ({
              ...a,
              key: "k",
              url: `http://127.0.0.1:${port}/put/${a.kind}-${a.idx}`,
            })),
          }),
        );
      }
      res.end(JSON.stringify({ ok: true, uploadStatus: "partial" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const data = mkdtempSync(join(tmpdir(), "tb-boom-"));
  const env: NodeJS.ProcessEnv = { ...process.env, TETRA_GUEST_URL: `http://127.0.0.1:${port}` };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [appDir, ...camera, `--data=${data}`, "--use-mock-keychain"],
    env: env as Record<string, string>,
  });
  // Log harian booth (renderer ikut ditulis): "<ISO> R-INFO [session] capture …".
  const log = () => {
    const dir = join(data, "logs");
    return existsSync(dir)
      ? readdirSync(dir).flatMap((f) => readFileSync(join(dir, f), "utf8").split("\n"))
      : [];
  };
  const name = `boomerang-${boomerang ? "on" : "off"}${camera === WEBCAM ? "-webcam" : ""}`;
  try {
    const w = await app.firstWindow();
    await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();
    for (let i = 0; i < 5; i++) await w.getByTestId("crew-hotspot").click();
    await typePin(w, "2468");
    await typePin(w, "2468");
    await w.getByTestId("step-pair").getByRole("button", { name: "Sambungkan" }).click();
    await typePin(w, "123456");
    await expect(w.getByTestId("pair-device")).toContainText("Booth Uji · B09");
    await w.getByRole("button", { name: "Kembali ke Menu Crew" }).click();
    await w.getByTestId("step-event").getByRole("button").click();
    await w.getByRole("button", { name: /Mode Event/ }).click();
    await w.getByRole("button", { name: "Ambil event terbaru" }).click();
    await w.getByRole("button", { name: /Uji Boomerang/ }).click();
    await w.getByTestId("to-guest").click();
    await w.getByRole("button", { name: /^Mulai acara/ }).click();
    await w.waitForTimeout(1500); // Camera Service + kamera palsu siap

    await w.getByRole("button", { name: /sentuh untuk mulai/i }).click();
    await expect(w.getByText("Foto 1 dari 3")).toBeVisible();
    await expect(w.getByTestId("countdown-number")).toBeVisible({ timeout: 5000 });
    await w.screenshot({ path: `test-results/${name}-countdown.png` });
    // #269: live view tetap mengalir di foto 2 & 3.
    const frames = () => w.getByTestId("liveview").evaluate((c) => Number(c.dataset.frames ?? 0));
    for (const n of [2, 3]) {
      await expect(w.getByText(`Foto ${n} dari 3`)).toBeVisible({ timeout: 30_000 });
      const before = await frames();
      await expect.poll(frames, { timeout: 5000 }).toBeGreaterThan(before + 5);
    }
    await w.getByRole("button", { name: /pakai semua foto/i }).click({ timeout: 30_000 });
    await expect(w.getByRole("heading", { name: "Mau cetak berapa?" })).toBeVisible({
      timeout: 15_000,
    });
    await w.getByRole("button", { name: /cetak sekarang/i }).click();
    await expect
      .poll(() => sessions[0], { timeout: 30_000 })
      .toMatchObject({ eventId: EVENT, photoCount: 3 });
    await expect.poll(() => puts.has("strip-0"), { timeout: 30_000 }).toBe(true);
    await w.screenshot({ path: `test-results/${name}-qr.png` });

    // Jepret → layar foto (preview) per foto, dari log transisi fase.
    const at = (re: RegExp) =>
      log()
        .filter((l) => re.test(l))
        .map((l) => Date.parse(l.slice(0, 24)));
    const caps = at(/\[session\] capture /);
    const prev = at(/\[session\] preview /);
    const ms = prev.map((t, i) => t - (caps[i] ?? t));
    console.log(`[${name}] jepret→preview ms: ${ms.join(", ")}`);
    expect(ms).toHaveLength(3);
    await after({ name, signed, puts, w, log });
  } finally {
    await app.close();
    server.close();
  }
}

/** Boomerang terunggah sebagai video idx 1, MP4 720×405 ±5,6 dtk; diputar di jendela booth + 3 screenshot. */
async function boomerangUploaded({ name, signed, puts, w, log }: Done) {
  await expect.poll(() => puts.has("video-1"), { timeout: 30_000 }).toBe(true);
  expect(signed).not.toContain("video:0"); // video hitung mundur tetap mati
  const mp4 = puts.get("video-1") ?? Buffer.alloc(0);
  expect(mp4.subarray(4, 8).toString()).toBe("ftyp");
  expect(log().some((l) => /\[session\] boomerang \d+ KB/.test(l))).toBe(true);
  mkdirSync("test-results", { recursive: true });
  writeFileSync(`test-results/${name}.mp4`, mp4);
  const info = await w.evaluate(async (b64) => {
    const v = document.createElement("video");
    v.muted = true;
    v.src = URL.createObjectURL(
      new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: "video/mp4" }),
    );
    v.style.cssText =
      "position:fixed;inset:0;z-index:9999;width:100vw;height:100vh;background:#000";
    document.body.append(v);
    await new Promise((ok, no) => {
      v.onloadeddata = ok;
      v.onerror = () => no(new Error("video tidak bisa diputar"));
    });
    await v.play();
    return { w: v.videoWidth, h: v.videoHeight };
  }, mp4.toString("base64"));
  for (const t of [1, 2, 3]) {
    await w.waitForTimeout(1500);
    await w.screenshot({ path: `test-results/${name}-play-${t}.png` });
  }
  await w.waitForTimeout(1000);
  const played = await w.evaluate(() => {
    const v = document.querySelectorAll("video");
    return v[v.length - 1]?.currentTime ?? 0;
  });
  console.log(`[${name}] mp4 ${Math.round(mp4.length / 1024)} KB`, info, { played });
  expect(info).toEqual({ w: 720, h: 405 });
  // 3 foto × (15 maju + 13 mundur) / 15 fps ≈ 5,6 dtk.
  expect(played).toBeGreaterThan(4.5);
}

test("boomerang nyala (Canon palsu): MP4 maju-mundur ikut diunggah (video idx 1), sesi selesai", async () => {
  test.skip(!existsSync(serviceBin), "Camera Service belum di-build");
  await runSession(true, boomerangUploaded);
});

test("boomerang nyala (webcam): MP4 ikut diunggah, sesi selesai", async () => {
  await runSession(true, boomerangUploaded, WEBCAM);
});

test("boomerang mati (bawaan): tidak ada aset boomerang, sesi selesai seperti biasa", async () => {
  test.skip(!existsSync(serviceBin), "Camera Service belum di-build");
  await runSession(false, async ({ signed }) => {
    expect(signed).toContain("strip:0");
    expect(signed.filter((s) => s.startsWith("video"))).toEqual([]);
  });
});
