import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: {}, powerSaveBlocker: {} }));
const { isBlockedShortcut, setKioskOn } = await import("./kiosk");

const key = (
  key: string,
  mods: Partial<{ control: boolean; meta: boolean; alt: boolean; shift: boolean }> = {},
) => ({
  type: "keyDown",
  key,
  control: false,
  meta: false,
  alt: false,
  shift: false,
  ...mods,
});

describe("kiosk: shortcut yang diblokir", () => {
  it("reload, devtools, fullscreen, tutup, zoom", () => {
    for (const k of [
      key("F5"),
      key("F11"),
      key("F12"),
      key("F4", { alt: true }),
      key("r", { control: true }),
      key("w", { control: true }),
      key("q", { meta: true }),
      key("I", { control: true, shift: true }),
      key("=", { control: true }),
    ]) {
      expect(isBlockedShortcut(k), JSON.stringify(k)).toBe(true);
    }
  });
  it("ketikan biasa & angka PIN tetap lewat; keyUp tidak diblokir", () => {
    for (const k of [key("1"), key("a"), key("Enter"), key("Backspace"), key("r")]) {
      expect(isBlockedShortcut(k)).toBe(false);
    }
    expect(isBlockedShortcut({ ...key("F5"), type: "keyUp" })).toBe(false);
  });
});

describe("kiosk: selalu di atas", () => {
  it("dipasang dan dilepas bersama kiosk (taskbar tidak menimpa booth; dialog printer/admin tetap bisa tampil)", () => {
    const calls: string[] = [];
    const win = {
      setKiosk: (on: boolean) => calls.push(`kiosk:${on}`),
      setAlwaysOnTop: (on: boolean, level: string) => calls.push(`top:${on}:${level}`),
    } as unknown as Parameters<typeof setKioskOn>[0];
    setKioskOn(win, true);
    setKioskOn(win, false);
    expect(calls).toEqual([
      "kiosk:true",
      "top:true:screen-saver",
      "kiosk:false",
      "top:false:screen-saver",
    ]);
  });
});
