import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** CLAUDE.md aturan 9: booth-core tidak boleh mengimpor Electron, Node, atau Capacitor. */
const FORBIDDEN =
  /from\s+["'](electron|node:[^"']+|fs|path|os|child_process|@capacitor\/[^"']+)["']/;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

describe("booth-core isolasi platform", () => {
  it("tidak ada impor electron/node/capacitor di src", () => {
    const src = join(import.meta.dirname, "..", "src");
    const offenders = walk(src).filter((f) => FORBIDDEN.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
