import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./event";
import { GuestCamSettingsSchema, GuestJoinRequest, guestParts, idxAllowed } from "./guest-cam";

describe("GuestJoinRequest", () => {
  it("menormalkan WhatsApp dan Instagram", () => {
    const r = GuestJoinRequest.parse({
      name: " Sari ",
      whatsapp: "0812-3456-7890",
      instagram: "https://instagram.com/Sari.Andi/",
      consent: true,
    });
    expect(r).toEqual({ name: "Sari", whatsapp: "6281234567890", instagram: "sari.andi" });
  });
  it("cukup salah satu kontak", () => {
    expect(GuestJoinRequest.parse({ name: "Andi", instagram: "@andi_", consent: true })).toEqual({
      name: "Andi",
      whatsapp: undefined,
      instagram: "andi_",
    });
  });
  it("menolak tanpa kontak, kontak rusak, atau tanpa persetujuan", () => {
    expect(GuestJoinRequest.safeParse({ name: "Andi", consent: true }).success).toBe(false);
    expect(
      GuestJoinRequest.safeParse({ name: "Andi", whatsapp: "123", consent: true }).success,
    ).toBe(false);
    expect(
      GuestJoinRequest.safeParse({ name: "Andi", instagram: "a b", consent: true }).success,
    ).toBe(false);
    expect(GuestJoinRequest.safeParse({ name: "Andi", whatsapp: "08123456789" }).success).toBe(
      false,
    );
  });
});

describe("setelan Guest Cam", () => {
  it("event lama tanpa guestCam dapat default mati", () => {
    expect(DEFAULT_SETTINGS.guestCam).toMatchObject({
      enabled: false,
      shots: 15,
      reveal: "after",
      approval: "auto",
    });
  });
});

describe("jatah unggahan tamu", () => {
  const cam = GuestCamSettingsSchema.parse({ enabled: true, shots: 3 });
  it("foto hanya idx 0…shots−1", () => {
    expect([0, 2, 3].map((i) => idxAllowed(cam, "photo", i))).toEqual([true, true, false]);
  });
  it("suara hanya idx 0 dan kalau aktif; strip maks 5 dan kalau aktif", () => {
    expect(idxAllowed(cam, "audio", 0)).toBe(true);
    expect(idxAllowed(cam, "audio", 1)).toBe(false);
    expect(idxAllowed({ ...cam, voice: false }, "audio", 0)).toBe(false);
    expect(idxAllowed(cam, "strip", 4)).toBe(true);
    expect(idxAllowed(cam, "strip", 5)).toBe(false);
    expect(idxAllowed({ ...cam, strip: false }, "strip", 0)).toBe(false);
  });
  it("bagian file: foto = original + thumb, suara iOS = m4a", () => {
    expect(guestParts("photo").map((p) => p.kind)).toEqual(["original", "thumb_original"]);
    expect(guestParts("audio", "audio/mp4")[0]).toMatchObject({ kind: "audio", ext: "m4a" });
    expect(guestParts("audio")[0]).toMatchObject({ ext: "webm", contentType: "audio/webm" });
  });
});
