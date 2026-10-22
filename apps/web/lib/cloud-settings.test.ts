import { describe, expect, it } from "vitest";
import { type CloudRow, cloudSettingsOf, cloudSettingsUpdate } from "./cloud-settings";

const row = (o: Partial<CloudRow> = {}): CloudRow => ({
  slug: "rafi-dinda",
  client_token: null,
  live_token: null,
  guest_token: null,
  guest_link: null,
  settings: { countdownSec: 5, guestCam: { enabled: false, shots: 15 } },
  lead_capture: { enabled: false, mode: "optional", fields: ["phone"], consentText: "Setuju" },
  promo_off: false,
  branding: { tagline: "The Wedding of", color: "#d6eef8" },
  client_instagram: [],
  bundle: {
    config: { tagline: "The Wedding of", settings: { guestCam: { enabled: false } } },
    files: [],
  },
  bundle_version: 7,
  ...o,
});
const gen = { token: () => "TOK", guestLink: "rafi-dinda" };

describe("Backstage tahap 2: setelan cloud dari booth (#295)", () => {
  it("baca: link mati, Guest Cam butuh setelan nyala + link", () => {
    expect(cloudSettingsOf(row())).toMatchObject({
      clientLink: false,
      guestCam: false,
      leadReady: true,
      tagline: "The Wedding of",
      guestColor: "#d6eef8",
    });
    const on = row({
      guest_token: "g",
      guest_link: "rafi-dinda",
      settings: { guestCam: { enabled: true } },
    });
    expect(cloudSettingsOf(on)).toMatchObject({ guestCam: true, guestPath: "/c/rafi-dinda" });
  });

  it("link klien: nyala pakai token lama kalau ada, mati = null; tanpa naik versi bundle", () => {
    expect(cloudSettingsUpdate(row(), { clientLink: true }, gen).update).toEqual({
      client_token: "TOK",
    });
    expect(
      cloudSettingsUpdate(row({ client_token: "old" }), { clientLink: true }, gen).update,
    ).toEqual({ client_token: "old" });
    expect(
      cloudSettingsUpdate(row({ client_token: "old" }), { clientLink: false }, gen).update,
    ).toEqual({ client_token: null });
  });

  it("Guest Cam nyala: setelan + bundle booth + link baru, versi bundle naik", () => {
    const { update } = cloudSettingsUpdate(row(), { guestCam: true }, gen);
    expect(update.guest_token).toBe("TOK");
    expect(update.guest_link).toBe("rafi-dinda");
    expect(update.bundle_version).toBe(8);
    expect(update.settings).toMatchObject({
      countdownSec: 5,
      guestCam: { enabled: true, shots: 15 },
    });
    expect(update.bundle).toMatchObject({ config: { settings: { guestCam: { enabled: true } } } });
  });

  it("tagline ke halaman tamu + layar awal booth; kosong = dihapus; warna bawaan tidak disimpan", () => {
    const { update } = cloudSettingsUpdate(row(), { tagline: "", guestColor: "#F8F7F4" }, gen);
    expect(update.branding).toEqual({});
    expect(update.bundle).toEqual({
      config: { settings: { guestCam: { enabled: false } } },
      files: [],
    });
    expect(update.bundle_version).toBe(8);
  });

  it("lead capture: tidak bisa dinyalakan sebelum field + persetujuan diatur admin", () => {
    const notReady = row({ lead_capture: { enabled: false, fields: [], consentText: "" } });
    expect(cloudSettingsUpdate(notReady, { leadCapture: true }, gen).error).toBe("lead_not_ready");
    expect(
      cloudSettingsUpdate(row(), { leadCapture: true }, gen).update.lead_capture,
    ).toMatchObject({
      enabled: true,
      fields: ["phone"],
    });
  });

  it("event tanpa bundle tersimpan: versi naik, bundle tidak dibuat setengah jadi", () => {
    const { update } = cloudSettingsUpdate(row({ bundle: null }), { tagline: "Hai" }, gen);
    expect(update.bundle).toBeUndefined();
    expect(update.bundle_version).toBe(8);
  });
});
