import { describe, expect, it } from "vitest";
import { isVirtualPrinter, orderPrinters, parseWin32Printers } from "./printers";

// Keluaran asli laptop B04 (10 Okt), DNP di USB003, antrean "Copy 2" sisa colokan USB lain.
const B04 =
  '[{"Name":"OneNote (Desktop)","PortName":"nul:","WorkOffline":false},' +
  '{"Name":"Microsoft XPS Document Writer","PortName":"PORTPROMPT:","WorkOffline":false},' +
  '{"Name":"Microsoft Print to PDF","PortName":"PORTPROMPT:","WorkOffline":false},' +
  '{"Name":"Fax","PortName":"SHRFAX:","WorkOffline":false},' +
  '{"Name":"DS-RX1 (Copy 2)","PortName":"USB001","WorkOffline":true},' +
  '{"Name":"DS-RX1","PortName":"USB003","WorkOffline":false}]';
const ELECTRON_ORDER = [
  "OneNote (Desktop)",
  "Microsoft XPS Document Writer",
  "Microsoft Print to PDF",
  "Fax",
  "DS-RX1 (Copy 2)",
  "DS-RX1",
];

describe("antrean printer Windows (audit B04)", () => {
  it("membaca WorkOffline & port dari Win32_Printer", () => {
    const q = parseWin32Printers(B04);
    expect(q["DS-RX1"]).toEqual({ offline: false, port: "USB003" });
    expect(q["DS-RX1 (Copy 2)"]).toEqual({ offline: true, port: "USB001" });
  });

  it("satu printer = objek tunggal, bukan array", () => {
    const one = '{"Name":"DS-RX1","PortName":"USB003","WorkOffline":true}';
    expect(parseWin32Printers(one)).toEqual({ "DS-RX1": { offline: true, port: "USB003" } });
  });

  it("keluaran rusak/kosong → tanpa status", () => {
    expect(parseWin32Printers("")).toEqual({});
    expect(parseWin32Printers("bukan json")).toEqual({});
    expect(parseWin32Printers('[null,{"PortName":"USB001"}]')).toEqual({});
  });

  it("printer virtual: OneNote, XPS, Fax; Print to PDF bukan", () => {
    expect(isVirtualPrinter("OneNote (Desktop)")).toBe(true);
    expect(isVirtualPrinter("OneNote for Windows 10")).toBe(true);
    expect(isVirtualPrinter("Microsoft XPS Document Writer")).toBe(true);
    expect(isVirtualPrinter("Fax")).toBe(true);
    expect(isVirtualPrinter("Microsoft Print to PDF")).toBe(false);
    expect(isVirtualPrinter("DS-RX1")).toBe(false);
    expect(isVirtualPrinter("Fax Kantor DNP")).toBe(false);
  });

  it("yang tersambung di atas, antrean offline di bawah, printer virtual disembunyikan", () => {
    expect(orderPrinters(ELECTRON_ORDER, parseWin32Printers(B04), "DS-RX1")).toEqual([
      "Microsoft Print to PDF",
      "DS-RX1",
      "DS-RX1 (Copy 2)",
    ]);
  });

  it("printer virtual yang sedang dipakai tetap tampil", () => {
    expect(orderPrinters(ELECTRON_ORDER, parseWin32Printers(B04), "Fax")).toContain("Fax");
  });

  it("tanpa status (bukan Windows / PowerShell gagal): urutan asal, tanpa virtual", () => {
    expect(orderPrinters(ELECTRON_ORDER, {})).toEqual([
      "Microsoft Print to PDF",
      "DS-RX1 (Copy 2)",
      "DS-RX1",
    ]);
  });
});
