// Fase 2 (sebelum admin Fase 3): unggah bundle event lokal ke cloud dan tugaskan ke booth.
// pnpm --filter web event:push <folder-bundle> --device <short_code> [--event <uuid>] [--date YYYY-MM-DD]
// Folder = format bundle lokal Fase 1 (config.json + aset). Tanpa --event: buat event baru.
// Aset ke R2 berbasis hash (`{org}/{event}/bundle/{sha256}.ext`); bundle_version naik setiap push.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const need = (k) =>
  process.env[k] ||
  (() => {
    throw new Error(`env ${k} belum diisi`);
  })();
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const folder = process.argv[2];
const deviceCode = arg("device");
if (!folder || folder.startsWith("--") || !deviceCode)
  throw new Error("pakai: event:push <folder-bundle> --device <short_code> [--event <uuid>]");

const dir = resolve(process.env.INIT_CWD ?? process.cwd(), folder);
const config = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
if (!config.name || !config.layout) throw new Error("config.json bukan bundle event (name/layout)");
const { id: _localId, ...rest } = config;

const db = createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const must = ({ data, error }, what) => {
  if (error || !data) throw new Error(`${what}: ${error?.message ?? "tidak ditemukan"}`);
  return data;
};
const org = must(
  await db.from("organizations").select("id").eq("slug", "tetra").single(),
  "organisasi",
);
const device = must(
  await db
    .from("devices")
    .select("id, name")
    .eq("organization_id", org.id)
    .eq("short_code", deviceCode)
    .single(),
  `booth ${deviceCode}`,
);
const event = arg("event")
  ? must(
      await db
        .from("events")
        .select("id, bundle_version, bundle")
        .eq("organization_id", org.id)
        .eq("id", arg("event"))
        .single(),
      "event",
    )
  : must(
      await db
        .from("events")
        .insert({
          organization_id: org.id,
          name: config.name,
          mode: "event",
          event_date: arg("date") ?? new Date().toISOString().slice(0, 10),
          status: "ready",
          bundle_version: 0,
        })
        .select("id, bundle_version, bundle")
        .single(),
      "buat event",
    );

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${need("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: need("R2_ACCESS_KEY_ID"),
    secretAccessKey: need("R2_SECRET_ACCESS_KEY"),
  },
});
const TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff2": "font/woff2",
};
const files = [];
for (const file of new Set(Object.values(rest.assets ?? {}))) {
  const bytes = readFileSync(join(dir, file));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const ext = extname(file).toLowerCase();
  const key = `${org.id}/${event.id}/bundle/${sha256}${ext}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: need("R2_BUCKET"),
      Key: key,
      Body: bytes,
      ContentType: TYPES[ext] ?? "application/octet-stream",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  files.push({ file, sha256, key });
}

const version = event.bundle_version + 1;
must(
  await db
    .from("events")
    .update({ name: config.name, bundle: { config: rest, files }, bundle_version: version })
    .eq("organization_id", org.id)
    .eq("id", event.id)
    .select("id")
    .single(),
  "simpan bundle",
);
must(
  await db
    .from("event_devices")
    .upsert({ organization_id: org.id, event_id: event.id, device_id: device.id })
    .select("event_id")
    .single(),
  "tugaskan booth",
);
console.log(
  `event ${config.name} · ${event.id} · bundle v${version} · ${files.length} aset → booth ${device.name} (${deviceCode})`,
);
