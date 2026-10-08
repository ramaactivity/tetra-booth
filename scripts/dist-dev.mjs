// Build Windows: Electron (win-x64) + Camera Service (self-contained win-x64)
// -> installer NSIS `Tetra-Booth-Setup.exe` + zip untuk update.cmd -> upload ke R2 `dev-builds/`. Ikut di-upload: update.cmd & setup-windows-dev.ps1.
// Jalankan: pnpm dist:dev            (build + upload semua)
//           pnpm dist:dev --tools    (hanya upload script Windows, tanpa build)
// Butuh R2_* dan NEXT_PUBLIC_MEDIA_URL di apps/web/.env.local.

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const need = (k) =>
  process.env[k] ||
  (() => {
    throw new Error(`env ${k} belum diisi`);
  })();
const sh = (cmd, cwd = ".") =>
  execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, DOTNET_NOLOGO: "1" } });
const crlf = (t) => t.replace(/\r?\n/g, "\r\n"); // cmd.exe & PowerShell 5.1 butuh CRLF
const media = need("NEXT_PUBLIC_MEDIA_URL");
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${need("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: need("R2_ACCESS_KEY_ID"),
    secretAccessKey: need("R2_SECRET_ACCESS_KEY"),
  },
});
const put = (Key, Body, ContentType) =>
  s3.send(
    new PutObjectCommand({
      Bucket: need("R2_BUCKET"),
      Key,
      Body,
      ContentType,
      CacheControl: "no-cache",
    }),
  );
const tool = (f) =>
  crlf(readFileSync(`tools/windows/${f}`, "utf8").replaceAll("__MEDIA_URL__", media));

if (!process.argv.includes("--tools")) {
  const pkg = JSON.parse(readFileSync("apps/booth/package.json", "utf8"));
  const version = `${pkg.version} (${execSync("git rev-parse --short HEAD").toString().trim()} ${new Date().toISOString().slice(0, 16)})`;
  const setup = `Tetra-Booth-Setup-${pkg.version}.exe`;
  rmSync("dist", { recursive: true, force: true });
  mkdirSync("dist/app", { recursive: true });

  // Camera Service duluan: installer membawanya sebagai resources/camera (package.json build.extraResources).
  console.log("\n[1/4] Camera Service win-x64 self-contained");
  sh(
    "dotnet publish services/camera/TetraCamera.Host -c Release -r win-x64 --self-contained -o dist/camera",
  );

  // Installer NSIS di-build di Windows (GitHub Actions): uninstaller hasil build macOS rusak (DECISIONS #91).
  // Commit harus sudah di-push supaya CI membangun kode yang sama.
  const sha = execSync("git rev-parse HEAD").toString().trim();
  const ref = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
  // Yang ikut ke installer: booth, packages, Camera Service. Perubahan web/dokumen sesi lain di checkout yang sama
  // tidak memblokir rilis booth.
  if (
    execSync(`git status --porcelain --untracked-files=no -- . ":!apps/web" ":!docs" ":!supabase"`)
      .toString()
      .trim()
  )
    throw new Error("ada perubahan booth belum di-commit; commit & push dulu");
  if (execSync(`git rev-parse origin/${ref}`).toString().trim() !== sha)
    throw new Error(`HEAD belum di-push ke origin/${ref}`);
  console.log(
    `\n[2/4] Installer NSIS di GitHub Actions (windows-latest, ${ref} ${sha.slice(0, 7)})`,
  );
  sh(`gh workflow run booth-installer.yml --ref ${ref}`);
  let run = "";
  for (let i = 0; i < 30 && !run; i++) {
    execSync("sleep 4");
    run = execSync(
      `gh run list --workflow booth-installer.yml --limit 5 --json databaseId,headSha -q '[.[] | select(.headSha == "${sha}")][0].databaseId // ""'`,
    )
      .toString()
      .trim();
  }
  if (!run) throw new Error("run CI installer tidak ditemukan");
  console.log("\n[2b/4] Electron win-x64 (zip update.cmd) di Mac, sambil menunggu CI");
  sh("pnpm --filter booth build");
  sh("pnpm exec electron-builder --win --x64 --dir --publish never", "apps/booth");
  cpSync("apps/booth/release/win-unpacked", "dist/app/booth", { recursive: true });
  sh(`gh run watch ${run} --exit-status`);
  // Unduhan artifact kadang putus di tengah (timeout jaringan): ulang sampai 3x.
  for (let i = 1; ; i++) {
    try {
      rmSync("dist/installer", { recursive: true, force: true });
      sh(`gh run download ${run} -n booth-installer -D dist/installer`);
      break;
    } catch (e) {
      if (i === 3) throw e;
      console.log(`  unduh artifact gagal, ulang (${i}/3)`);
    }
  }

  console.log("\n[3/4] Zip (update.cmd)");
  writeFileSync("dist/app/run.cmd", tool("run.cmd"));
  writeFileSync("dist/app/VERSION.txt", `${version}\n`);
  sh("zip -qr ../tetra-booth-dev.zip .", "dist/app");
  const mb = (f) => `${(statSync(f).size / 1e6).toFixed(0)} MB`;
  console.log(
    `  zip ${mb("dist/tetra-booth-dev.zip")}, installer ${mb(`dist/installer/${setup}`)}, build ${version}`,
  );

  console.log("\n[4/4] Upload ke R2");
  await put(
    "dev-builds/tetra-booth-dev.zip",
    readFileSync("dist/tetra-booth-dev.zip"),
    "application/zip",
  );
  // Nama tetap (link untuk crew) + nama berversi (arsip).
  const exe = readFileSync(`dist/installer/${setup}`);
  await put(
    "dev-builds/Tetra-Booth-Setup.exe",
    exe,
    "application/vnd.microsoft.portable-executable",
  );
  await put(`dev-builds/${setup}`, exe, "application/vnd.microsoft.portable-executable");
  // Blockmap electron-builder untuk update diferensial (DECISIONS #139). Tidak ada di artifact = booth unduh penuh.
  const blockmap = `dist/installer/${setup}.blockmap`;
  const blockmapKey = existsSync(blockmap) ? `dev-builds/${setup}.blockmap` : undefined;
  if (blockmapKey) await put(blockmapKey, readFileSync(blockmap), "application/gzip");
  else console.log("  (blockmap tidak ada di artifact CI: booth akan mengunduh penuh)");
  // Dibaca /api/booth/update (tombol Update di mode crew) & /download/booth (DECISIONS #80). Ditulis terakhir.
  const release = {
    version: pkg.version,
    key: `dev-builds/${setup}`,
    sha256: createHash("sha256").update(exe).digest("hex"),
    size: exe.byteLength,
    blockmapKey,
  };
  await put("dev-builds/latest.json", JSON.stringify(release, null, 2), "application/json");
  console.log(`  OK: ${media}/dev-builds/tetra-booth-dev.zip`);
  console.log(`  Installer ${pkg.version}: https://booth.tetraphoto.com/download/booth`);
}

await put("dev-builds/update.cmd", tool("update.cmd"), "text/plain");
await put(
  "dev-builds/setup-windows-dev.ps1",
  tool("setup-windows-dev.ps1"),
  "text/plain; charset=utf-8",
);
console.log(`  Uji saja (tanpa setup dev): unduh ${media}/dev-builds/update.cmd, dobel klik.`);
console.log(
  `  Mesin dev Windows (PowerShell): irm ${media}/dev-builds/setup-windows-dev.ps1 | iex`,
);
