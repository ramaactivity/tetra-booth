import { describe, expect, it } from "vitest";
import { parseFlags } from "./config";

describe("parseFlags (M-008)", () => {
  it("menerima --nama=nilai dan --nama nilai (nilai berspasi dari shell)", () => {
    const f = parseFlags([
      "electron",
      "apps/booth",
      "--printer",
      "Microsoft Print to PDF",
      "--paper-4r=A5",
      "--demo",
    ]);
    expect(f.value("printer")).toBe("Microsoft Print to PDF");
    expect(f.value("paper-4r")).toBe("A5");
    expect(f.has("demo")).toBe(true);
    expect(f.has("no-spawn")).toBe(false);
  });
  it("flag nilai tanpa nilai dilaporkan, tidak menelan flag berikutnya", () => {
    const f = parseFlags(["--printer", "--demo", "--data"]);
    expect(f.value("printer")).toBeUndefined();
    expect(f.has("demo")).toBe(true);
    expect(f.missing).toEqual(["printer", "data"]);
  });
  it("flag boolean tidak mengambil argumen berikutnya", () => {
    const f = parseFlags(["--demo", "apps/booth", "--camera", "simulated"]);
    expect(f.has("demo")).toBe(true);
    expect(f.value("camera")).toBe("simulated");
  });
});
