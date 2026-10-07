import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Camera Service basi setelah merge (laporan Windows 7 Okt): tes kamera gagal palsu karena binary lama. Kalau ada
 * file .cs/.csproj yang lebih baru dari binary, `dotnet build` dulu. Binary belum ada = tes kamera dilewati sendiri.
 */
export default function globalSetup() {
  const root = join(__dirname, "../../../services/camera");
  const bin = join(
    root,
    "TetraCamera.Host/bin/Debug/net10.0",
    process.platform === "win32" ? "TetraCamera.exe" : "TetraCamera",
  );
  if (!existsSync(bin)) return;
  const built = statSync(bin).mtimeMs;
  const stale = (dir: string): boolean =>
    readdirSync(dir, { withFileTypes: true }).some((e) => {
      if (e.name === "bin" || e.name === "obj" || e.name.startsWith(".")) return false;
      const p = join(dir, e.name);
      return e.isDirectory()
        ? stale(p)
        : /\.(cs|csproj)$/.test(e.name) && statSync(p).mtimeMs > built;
    });
  if (!stale(root)) return;
  console.log("[e2e] Camera Service basi, dotnet build services/camera …");
  execSync("dotnet build services/camera -nologo -v q", {
    cwd: join(root, "../.."),
    stdio: "inherit",
  });
}
