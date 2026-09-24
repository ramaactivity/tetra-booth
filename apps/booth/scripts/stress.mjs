// Stress test booth (M8, PLAN-FASE-1): jalankan booth dalam mode demo sampai N sesi selesai, lalu nilai.
//
//   node apps/booth/scripts/stress.mjs --sessions 500 [--fast] [--exe "<Tetra Booth.exe>"] [--data <dir>]
//        [--max-min 600] [-- <flag booth lain, mis. --printer "Microsoft Print to PDF" --paper-2x6x2 A5 --print-to-file <dir>>]
//
// Lulus jika: N sesi selesai sebelum batas waktu, booth tidak berhenti sendiri, tanpa crash renderer, tanpa restart
// Camera Service, (kalau --print-to-file) jumlah PDF = jumlah sesi, median memori total di akhir ≤ 500 MB (03-TSD §14),
// memori aplikasi (main+renderer+Camera Service) dan handle Camera Service tumbuh ≤ 25% dibanding setelah pemanasan. Keluar 0 = lulus, 1 = gagal. Laporan JSON di <data>/stress-report.json.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
const own = sep < 0 ? argv : argv.slice(0, sep);
const passthrough = sep < 0 ? [] : argv.slice(sep + 1);
const opt = (name, def) => {
  const i = own.indexOf(`--${name}`);
  return i < 0 ? def : (own[i + 1] ?? def);
};
const N = Number(opt("sessions", 500));
const fast = own.includes("--fast");
const maxMin = Number(opt("max-min", fast ? 120 : 900));
const data = opt("data", mkdtempSync(join(tmpdir(), "tb-stress-")));
const exe = opt("exe", undefined);
const MEM_LIMIT_MB = 500;
const GROWTH_LIMIT = 0.25;

const electron = createRequire(import.meta.url)("electron");
const [cmd, baseArgs] = exe ? [exe, []] : [electron, [join(here, "..")]];
const args = [
  ...baseArgs,
  "--demo",
  "--camera=simulated",
  `--data=${data}`,
  "--metrics-every=10",
  ...(fast ? ["--fast"] : []),
  ...passthrough,
];
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const printDir = (() => {
  const i = passthrough.indexOf("--print-to-file");
  return i < 0 ? undefined : passthrough[i + 1];
})();

console.log(
  `[stress] ${N} sesi, ${fast ? "cepat" : "waktu normal"}, batas ${maxMin} menit, data ${data}`,
);
const t0 = Date.now();
const child = spawn(cmd, args, { env, stdio: "ignore" });
let exited = null;
child.on("exit", (code, signal) => {
  exited = { code, signal };
});

const readLog = () => {
  const dir = join(data, "logs");
  if (!existsSync(dir)) return "";
  return readdirSync(dir)
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("");
};
const count = (log, re) => (log.match(re) ?? []).length;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let log = "";
for (;;) {
  await sleep(10_000);
  log = readLog();
  const done = count(log, /\[session\] selesai /g);
  const min = (Date.now() - t0) / 60000;
  process.stdout.write(`\r[stress] ${done}/${N} sesi · ${min.toFixed(1)} menit`);
  if (done >= N || exited || min > maxMin) break;
}
console.log("");
const exitedEarly = exited; // dicatat sebelum skrip ini sendiri menghentikan booth
if (!exited) {
  child.kill();
  await sleep(3000);
}
log = readLog();

// Metrik: baris "[metrics] sesi=.. main=.. renderer=.. gpu=.. lain=.. camera=.. handles=.. total=.."
const metrics = [...log.matchAll(/\[metrics\] (.*)/g)].map((m) =>
  Object.fromEntries(
    m[1]
      .split(" ")
      .map((kv) => kv.split("="))
      .map(([k, v]) => [k, Number(v)]),
  ),
);
const median = (xs) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : 0;
};
const warm = metrics.filter((m) => m.sesi >= Math.min(20, N / 5));
const k = Math.max(1, Math.floor(warm.length / 10));
// Leak dinilai dari memori aplikasi (main + renderer + Camera Service); GPU naik-turun sendiri (terutama macOS).
const app = (m) => (m.main || 0) + (m.renderer || 0) + (m.camera || 0);
const at = (xs, f) => median(xs.map(f));
const early = at(warm.slice(0, k), app);
const late = at(warm.slice(-k), app);
const totalLate = at(warm.slice(-k), (m) => m.total);
const peak = Math.max(0, ...metrics.map((m) => m.total));
// .NET di macOS/Linux tidak melaporkan handle (0) → tidak tersedia.
const handles = (xs) => {
  const h = xs.map((m) => m.handles).filter((x) => Number.isFinite(x) && x > 0);
  return h.length ? median(h) : null;
};

const sessions = count(log, /\[session\] selesai /g);
const pdfs =
  printDir && existsSync(printDir)
    ? readdirSync(printDir).filter((f) => f.endsWith(".pdf")).length
    : null;
const report = {
  sessions,
  target: N,
  minutes: Math.round((Date.now() - t0) / 600) / 100,
  boothExitedEarly: exitedEarly,
  rendererCrashes: count(log, /renderer mati/g),
  cameraServiceRestarts: count(log, /Camera Service berhenti/g),
  captureFailures: count(log, /capture gagal/g),
  printFailures: count(log, /\[print\] GAGAL/g),
  errors: count(log, / ERROR /g) - count(log, /ERROR Error occurred in handler for 'printSubmit'/g),
  pdfs,
  memoryMb: {
    appAfterWarmup: early,
    appEnd: late,
    appGrowthPct: early ? Math.round(((late - early) / early) * 1000) / 10 : null,
    totalEnd: totalLate,
    totalPeak: peak,
  },
  cameraHandles: { afterWarmup: handles(warm.slice(0, k)), end: handles(warm.slice(-k)) },
  samples: metrics.length,
};
const checks = {
  "sesi tercapai": sessions >= N,
  "booth tidak berhenti sendiri": !exitedEarly,
  "tanpa crash renderer": report.rendererCrashes === 0,
  "Camera Service tidak restart": report.cameraServiceRestarts === 0,
  "PDF = sesi": pdfs === null || pdfs >= sessions,
  [`memori total akhir ≤ ${MEM_LIMIT_MB} MB (median)`]: totalLate > 0 && totalLate <= MEM_LIMIT_MB,
  [`memori aplikasi tumbuh ≤ ${GROWTH_LIMIT * 100}%`]:
    early > 0 && late <= early * (1 + GROWTH_LIMIT),
  "handle Camera Service tidak tumbuh ≤ 25%": (() => {
    const [a, b] = [report.cameraHandles.afterWarmup, report.cameraHandles.end];
    return a === null || b === null || b <= a * 1.25;
  })(),
};
writeFileSync(join(data, "stress-report.json"), JSON.stringify({ report, checks }, null, 2));
console.log(JSON.stringify(report, null, 2));
for (const [name, ok] of Object.entries(checks)) console.log(`${ok ? "LULUS" : "GAGAL"}  ${name}`);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
