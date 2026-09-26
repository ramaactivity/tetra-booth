import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/r2", () => ({ putObject: async () => {} }));
vi.mock("@/lib/guest", () => ({ longDate: (d: string) => d }));
const { buildBundle } = await import("./event-bundle");

const f = (file: string) => ({ file, sha256: "0".repeat(64), key: `k/${file}` });
const custom = {
  layout: {
    id: "abcdef12-3456",
    version: 2,
    paper: "4R" as const,
    canvas: { width: 1200, height: 1800, dpi: 300 as const },
    slots: [
      { id: "a", x: 0, y: 0, w: 600, h: 900, fit: "cover" as const, z: "below_overlay" as const },
    ],
    overlay: { assetId: "ov" },
    texts: [
      {
        x: 0,
        y: 0,
        w: 100,
        size: 40,
        color: "#000000",
        align: "left" as const,
        value: "x",
        fontAssetId: "f1",
      },
    ],
  },
  files: { ov: f("ov.png"), f1: f("f1.ttf") },
};
const base = {
  id: "11111111-2222-3333-4444-555555555555",
  name: "A & B",
  eventDate: "2026-10-12",
  settings: {},
  template: { preset: "strip-3" as const, background: "#ffffff" },
  branding: {},
  overlay: null,
};

describe("buildBundle designs (DECISIONS #99)", () => {
  it("desain tambahan template editor: aset diberi awalan d1-, rujukan layout ikut", () => {
    const b = buildBundle({ ...base, extras: [{ name: "Emas", custom }] }) as {
      config: {
        designs: {
          name: string;
          layout: { overlay: { assetId: string }; texts: { fontAssetId: string }[] };
        }[];
        assets: Record<string, string>;
      };
      files: { file: string; key: string }[];
    };
    expect(b.config.designs.map((d) => d.name)).toEqual(["Strip Klasik", "Emas"]);
    const d = b.config.designs[1];
    expect(d?.layout.overlay.assetId).toBe("d1-ov");
    expect(d?.layout.texts[0]?.fontAssetId).toBe("d1-f1");
    expect(b.config.assets).toEqual({ "d1-ov": "d1-ov.png", "d1-f1": "d1-f1.ttf" });
    expect(b.files.map((x) => [x.file, x.key])).toEqual([
      ["d1-ov.png", "k/ov.png"],
      ["d1-f1.ttf", "k/f1.ttf"],
    ]);
  });
  it("suara per cue (#104): mati = off, pengganti = file snd-<cue>, bawaan = tidak ada", () => {
    const b = buildBundle({ ...base, sounds: { "3": "off", jepret: f("snd-jepret.wav") } }) as {
      config: { sounds: Record<string, string>; assets: Record<string, string> };
      files: { file: string }[];
    };
    expect(b.config.sounds).toEqual({ "3": "off", jepret: "snd-jepret" });
    expect(b.config.assets).toEqual({ "snd-jepret": "snd-jepret.wav" });
    expect(b.files.map((x) => x.file)).toEqual(["snd-jepret.wav"]);
    expect((buildBundle({ ...base, sounds: {} }) as { config: object }).config).not.toHaveProperty(
      "sounds",
    );
    // Mati dengan file pengganti tersimpan: bundle "off", file tetap ada (menyalakan lagi tanpa upload ulang).
    const off = buildBundle({
      ...base,
      sounds: { jepret: { off: true, file: f("snd-jepret.wav") } },
    }) as {
      config: { sounds: Record<string, string> };
      files: { file: string }[];
    };
    expect(off.config.sounds).toEqual({ jepret: "off" });
    expect(off.files.map((x) => x.file)).toEqual(["snd-jepret.wav"]);
  });
  it("photobox menjual template editor (#108): id tpl-<layoutId>, aset berawalan p<n>-, harga dari pengaturan", () => {
    const tpl = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const b = buildBundle({
      ...base,
      mode: "photobox",
      photobox: {
        layouts: [
          { preset: "strip-3", price: 25000 },
          { template: tpl, price: 40000 },
        ],
        extraPrintPrice: 10000,
      },
      pbTemplates: { [tpl]: { name: "Bingkai Emas", custom } },
    }) as {
      config: {
        photobox: {
          layouts: {
            id: string;
            name: string;
            price: number;
            layout: { overlay?: { assetId: string } };
          }[];
        };
        assets: Record<string, string>;
      };
    };
    const [a, t] = b.config.photobox.layouts;
    expect(a?.id).toBe("strip-3");
    expect(t).toMatchObject({ id: `tpl-${tpl}`, name: "Bingkai Emas", price: 40000 });
    expect(t?.layout.overlay?.assetId).toBe("p2-ov");
    expect(b.config.assets).toMatchObject({ "p2-ov": "p2-ov.png", "p2-f1": "p2-f1.ttf" });
  });
  it("tanpa desain tambahan / mode photobox → tanpa designs", () => {
    expect((buildBundle(base) as { config: object }).config).not.toHaveProperty("designs");
    const pb = buildBundle({
      ...base,
      mode: "photobox",
      photobox: { layouts: [{ preset: "strip-3", price: 25000 }], extraPrintPrice: 0 },
      extras: [{ preset: "4r-grid" }],
    }) as { config: object };
    expect(pb.config).not.toHaveProperty("designs");
  });
});
