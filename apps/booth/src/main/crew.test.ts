import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assetPath,
  checkPin,
  createPinGuard,
  hashPin,
  LOCK_MS,
  loadBundles,
  MAX_PIN_FAILURES,
} from "./crew";
import { openDb } from "./db";

const memStore = () => {
  let v: string | null = null;
  return {
    get: () => v,
    set: (x: string) => {
      v = x;
    },
  };
};

describe("PIN crew", () => {
  it("hash tidak menyimpan PIN mentah; cek benar/salah", () => {
    const h = hashPin("1234");
    expect(h).not.toContain("1234");
    expect(checkPin("1234", h)).toBe(true);
    expect(checkPin("4321", h)).toBe(false);
    expect(hashPin("1234")).not.toBe(h); // salt acak
  });

  it(`${MAX_PIN_FAILURES}x salah → terkunci ${LOCK_MS / 1000} detik, PIN benar pun ditolak saat terkunci`, () => {
    let t = 0;
    const g = createPinGuard(memStore(), () => t);
    g.set("2468");
    g.lock();
    for (let i = 0; i < MAX_PIN_FAILURES - 1; i++) expect(g.verify("0000").lockedUntil).toBeNull();
    expect(g.verify("0000").lockedUntil).toBe(LOCK_MS);
    expect(g.verify("2468").ok).toBe(false);
    t = LOCK_MS;
    expect(g.verify("2468")).toEqual({ ok: true, lockedUntil: null });
  });

  it("ganti PIN hanya setelah masuk; format 4–6 digit", () => {
    const g = createPinGuard(memStore());
    expect(() => g.set("12")).toThrow();
    g.set("1234");
    g.lock();
    expect(() => g.set("5555")).toThrow(/masuk mode crew/);
    g.verify("1234");
    g.set("5555");
    expect(g.verify("5555").ok).toBe(true);
  });
});

describe("bundle event lokal", () => {
  const layout = {
    id: "l",
    version: 1,
    paper: "4R",
    canvas: { width: 1200, height: 1800, dpi: 300 },
    slots: [{ id: "a", x: 0, y: 0, w: 100, h: 100, fit: "cover", z: "below_overlay" }],
    overlay: { assetId: "ov" },
    texts: [],
  };
  const put = (root: string, name: string, cfg: object | string, files: string[] = []) => {
    const dir = join(root, name, "bundle");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "config.json"), typeof cfg === "string" ? cfg : JSON.stringify(cfg));
    for (const f of files) writeFileSync(join(dir, f), "x");
  };

  it("memuat bundle valid, melewati yang rusak/aset hilang dengan log", () => {
    const root = mkdtempSync(join(tmpdir(), "ev-"));
    put(
      root,
      "ok",
      {
        id: "andi-sari",
        name: "Andi & Sari",
        date: "12 Okt",
        layout,
        assets: { ov: "overlay.png" },
      },
      ["overlay.png"],
    );
    put(root, "no-file", { id: "x", name: "x", date: "x", layout, assets: { ov: "hilang.png" } });
    put(root, "bad-json", "{");
    const logs: string[] = [];
    const b = loadBundles(root, (m) => logs.push(m));
    expect(b.map((x) => x.id)).toEqual(["andi-sari"]);
    expect(logs).toHaveLength(2);
    const [ok] = b;
    if (!ok) throw new Error("bundle valid tidak termuat");
    expect(assetPath(ok, "ov")).toBe(join(root, "ok", "bundle", "overlay.png"));
    expect(() => assetPath(ok, "tidak-ada")).toThrow();
  });
});

describe("counter kertas & cetak ulang", () => {
  it("cetak selesai mengurangi kertas sebanyak salinan; gagal tidak", () => {
    const db = openDb(":memory:");
    db.resetPaper(700);
    db.printJob({ id: "a", sessionId: "a", path: "/p", copies: 2, paper: "4R", status: "queued" });
    db.printJob({ id: "b", sessionId: "b", path: "/p", copies: 1, paper: "4R", status: "queued" });
    db.printJobResult("a", "done");
    db.printJobResult("b", "failed", "printer_error: ribbon habis");
    expect(db.paper()).toEqual({ remaining: 698, capacity: 700 });
    expect(db.failedPrints().map((j) => [j.id, j.error])).toEqual([
      ["b", "printer_error: ribbon habis"],
    ]);
    db.printJobResult("b", "reprinted");
    expect(db.failedPrints()).toEqual([]);
  });
});
