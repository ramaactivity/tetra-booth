import { describe, expect, it } from "vitest";
import { auditText } from "./audit-text";

describe("auditText", () => {
  it("kode aksi → kalimat sehari-hari", () => {
    expect(auditText("link.client.new", null)).toBe("membuat link galeri klien");
    expect(auditText("link.live.revoke", null)).toBe("mencabut link live slideshow");
    expect(auditText("guest.reject", { count: 3 })).toBe("menolak 3 foto Guest Cam");
    expect(auditText("event.quick.approval", { value: "manual" })).toBe(
      "mengubah persetujuan foto Guest Cam jadi Manual (Akses cepat)",
    );
    expect(auditText("event.quick.promo", { value: false })).toBe(
      "mengubah kartu promosi jadi mati (Akses cepat)",
    );
    expect(auditText("event.settings", { bundleVersion: 7 })).toBe(
      "menyimpan Pengaturan event (versi booth v7)",
    );
    expect(auditText("session.delete", { eventId: "x" })).toBe("menghapus satu sesi");
  });
  it("kode yang belum dikenal tetap tampil", () => {
    expect(auditText("sesuatu.baru", null)).toBe("sesuatu.baru");
  });
});
