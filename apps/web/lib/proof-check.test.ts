import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { checkProof, parseAnswer } = await import("./proof-check");

const input = {
  kind: "instagram" as const,
  image: new Uint8Array([1, 2, 3]),
  mime: "image/jpeg",
  handles: ["tetraphotobooth"],
  org: "Tetra Photobooth",
};
const reply = (content: string, status = 200) =>
  vi.fn(
    async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }),
  );

describe("proof-check (#219)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("parseAnswer: JSON di dalam teks/markdown, rusak → null", () => {
    expect(parseAnswer('```json\n{"match": true, "reason": "ada tag"}\n```')).toEqual({
      match: true,
      reason: "ada tag",
    });
    expect(parseAnswer("tidak tahu")).toBeNull();
    expect(parseAnswer('{"match": "ya"}')).toBeNull();
  });

  it("tanpa AI_API_KEY → null (belum dicek), tanpa memanggil jaringan", async () => {
    vi.stubEnv("AI_API_KEY", "");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await checkProof(input)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("cocok → ok, tidak cocok → suspect + alasan; gambar dikirim sebagai data URL ke Sumopod", async () => {
    vi.stubEnv("AI_API_KEY", "k");
    const ok = reply('{"match": true, "reason": "Ada tag @tetraphotobooth"}');
    vi.stubGlobal("fetch", ok);
    expect(await checkProof(input)).toEqual({ verdict: "ok", reason: "Ada tag @tetraphotobooth" });
    const [url, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ai.sumopod.com/v1/chat/completions");
    expect(String(init.body)).toContain("data:image/jpeg;base64,AQID");
    vi.stubGlobal("fetch", reply('{"match": false, "reason": "Tidak ada tag akun"}'));
    expect(await checkProof(input)).toEqual({ verdict: "suspect", reason: "Tidak ada tag akun" });
  });

  it("HTTP gagal / kuota habis → null", async () => {
    vi.stubEnv("AI_API_KEY", "k");
    vi.stubGlobal("fetch", reply("", 429));
    expect(await checkProof(input)).toBeNull();
  });
});
