import { EVENT_PRESETS, LAYOUT_PRESETS, type PresetId, paperLabel } from "@tetra/shared";
import { isOnline } from "@/lib/format";
import { requireMember } from "@/lib/supabase/server";
import { opsConfigured } from "@/lib/tetra-ops";
import type { DesignOption } from "../[id]/settings/DesignPicker";
import { loadDesignOptions } from "../[id]/settings/design-options";
import { EventWizard } from "./EventWizard";

export const dynamic = "force-dynamic";

/** Bentuk dasar di luar preset event: dipakai lewat salinan template ("Salin & sesuaikan"). */
const BASICS: DesignOption[] = (Object.keys(LAYOUT_PRESETS) as PresetId[])
  .filter((id) => !(EVENT_PRESETS as readonly string[]).includes(id))
  .map((id) => {
    const { name, layout } = LAYOUT_PRESETS[id];
    const land = layout.canvas.width > layout.canvas.height;
    return {
      value: id,
      name: `${name}${land ? " landscape" : ""}`,
      paper: layout.paper,
      info: `${paperLabel(layout.paper, layout.canvas)} · ${layout.slots.length} foto · bentuk dasar`,
      layout: { id, version: 1, ...layout },
      copyOnly: true,
    };
  });

/** Wizard Buat event (5 langkah): info, mode, ukuran & desain (atau layout & harga), booth, ringkasan. */
export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  // "Buat Photobox" dari daftar Photobox (#156): mode Photobox sudah terpilih.
  const initialMode = (await searchParams).mode === "photobox" ? "photobox" : null;
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const [{ designOptions }, { data: devices }] = await Promise.all([
    loadDesignOptions(db, orgId),
    db
      .from("devices")
      .select("id, name, last_seen_at, token_hash")
      .eq("organization_id", orgId)
      .is("revoked_at", null)
      .order("short_code"),
  ]);
  const now = Date.now();
  return (
    <EventWizard
      initialMode={initialMode}
      opsEnabled={opsConfigured()}
      designOptions={[...designOptions, ...BASICS]}
      devices={(devices ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        status: !d.token_hash ? "unpaired" : isOnline(d.last_seen_at, now) ? "online" : "offline",
      }))}
    />
  );
}
