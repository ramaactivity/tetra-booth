import { describe, expect, it } from "vitest";
import { isLegacyDigicam, parseFlags, splitArgs } from "./config";

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
  it("file flag: komentar diabaikan, kutip untuk nilai berspasi, argumen belakangan menang", () => {
    const file = splitArgs(
      '# kamera 60D\r\n--camera hotfolder --hot-folder C:\\TetraBooth\\hot\r\n--printer "DS-RX1" --print-offset "7.335,6.70"\n',
    );
    expect(file).toEqual([
      "--camera",
      "hotfolder",
      "--hot-folder",
      "C:\\TetraBooth\\hot",
      "--printer",
      "DS-RX1",
      "--print-offset",
      "7.335,6.70",
    ]);
    const f = parseFlags([...file, "--printer", "Microsoft Print to PDF"]);
    expect(f.value("printer")).toBe("Microsoft Print to PDF");
    expect(f.value("hot-folder")).toBe("C:\\TetraBooth\\hot");
  });
});

describe("migrasi digiCamControl → Canon EDSDK (#168)", () => {
  const legacy = (...a: string[]) => isLegacyDigicam(parseFlags(a));
  it("--digicam dan hot folder berpemicu port 5513 = booth digiCamControl lama", () => {
    expect(legacy("--digicam")).toBe(true);
    expect(
      legacy("--camera", "hotfolder", "--hot-folder-trigger", "http://127.0.0.1:5513/?CMD=Capture"),
    ).toBe(true);
    expect(legacy("--camera=hotfolder", "--hot-folder-trigger=http://localhost:5513")).toBe(true);
  });
  it("hot folder generik & kamera lain tidak dipindah", () => {
    expect(legacy("--camera", "hotfolder", "--hot-folder", "C:\\hot")).toBe(false);
    expect(legacy("--camera=hotfolder", "--hot-folder-trigger=http://127.0.0.1:55130/x")).toBe(
      false,
    );
    expect(legacy("--camera=webcam", "--hot-folder-trigger=http://127.0.0.1:5513/")).toBe(false);
  });
});
