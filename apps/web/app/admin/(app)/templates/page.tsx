import { paperLabel } from "@tetra/shared";
import { Copy, Pencil } from "lucide-react";
import Link from "next/link";
import { StoredLayout } from "@/lib/layouts";
import { requireMember } from "@/lib/supabase/server";
import { duplicateTemplate } from "./actions";
import { DeleteTemplateButton } from "./DeleteTemplateButton";
import { NewTemplateForm } from "./NewTemplateForm";

export const dynamic = "force-dynamic";

const when = (ts: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(ts));

const iconBtn =
  "flex size-9 items-center justify-center rounded-[10px] border-[1.5px] border-ink bg-white disabled:opacity-40";

/** Daftar template buatan admin (editor E4, DECISIONS #74). */
export default async function TemplatesPage() {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const { data } = await db
    .from("layouts")
    .select("id, name, paper, layout_versions(version, spec, created_at)")
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .order("version", { referencedTable: "layout_versions", ascending: false })
    .limit(1, { referencedTable: "layout_versions" });
  const rows = (data ?? []).map((l) => {
    const v = l.layout_versions[0];
    const spec = StoredLayout.safeParse(v?.spec);
    const layout = spec.success ? spec.data.layout : null;
    return {
      ...l,
      v,
      slots: layout?.slots.length ?? 0,
      format: layout ? paperLabel(layout.paper, layout.canvas) : l.paper,
      // Ikon format: sisi panjang 32 px, rasio kanvas.
      icon: layout
        ? {
            w: (32 * layout.canvas.width) / Math.max(layout.canvas.width, layout.canvas.height),
            h: (32 * layout.canvas.height) / Math.max(layout.canvas.width, layout.canvas.height),
          }
        : { w: 22, h: 32 },
    };
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[30px] font-extrabold tracking-[-0.03em]">Template</h1>
        <NewTemplateForm />
      </div>
      <div className="overflow-hidden rounded-2xl border-[1.5px] border-ink bg-white">
        <div className="grid h-[46px] grid-cols-[2.4fr_1fr_.8fr_.8fr_1.2fr_130px] items-center border-b-[1.5px] border-ink bg-paper px-5 text-xs font-bold text-text-2">
          <span>Nama template</span>
          <span>Format</span>
          <span>Slot</span>
          <span>Versi</span>
          <span>Terakhir disimpan</span>
          <span />
        </div>
        {rows.map((l) => (
          <div
            key={l.id}
            className="grid h-[62px] grid-cols-[2.4fr_1fr_.8fr_.8fr_1.2fr_130px] items-center border-b-[1.5px] border-dashed border-line-soft px-5 text-sm no-underline last:border-b-0 hover:bg-paper"
          >
            <Link
              href={`/admin/templates/${l.id}`}
              className="flex items-center gap-2.5 font-bold no-underline"
            >
              <span className="flex size-8 flex-none items-center justify-center">
                <span
                  className="rounded-[5px] border-[1.5px] border-ink bg-sky"
                  style={{ width: l.icon.w, height: l.icon.h }}
                />
              </span>
              {l.name}
            </Link>
            <span className="text-text-3">{l.format}</span>
            <span className="font-mono text-[13px]">{l.slots}</span>
            <span className="font-mono text-[13px]">v{l.v?.version ?? 1}</span>
            <span className="text-[13px] text-text-2">{l.v ? when(l.v.created_at) : "—"}</span>
            <span className="flex justify-end gap-1.5">
              <Link
                href={`/admin/templates/${l.id}`}
                aria-label={`Edit ${l.name}`}
                title="Edit"
                className={`${iconBtn} hover:bg-butter`}
              >
                <Pencil className="size-4" />
              </Link>
              <form action={duplicateTemplate.bind(null, l.id)}>
                <button
                  type="submit"
                  aria-label={`Duplikat ${l.name}`}
                  title="Duplikat"
                  className={`${iconBtn} hover:bg-mint-soft`}
                >
                  <Copy className="size-4" />
                </button>
              </form>
              <DeleteTemplateButton
                id={l.id}
                name={l.name}
                className={`${iconBtn} hover:bg-coral`}
              />
            </span>
          </div>
        ))}
        {!rows.length && (
          <p className="px-5 py-8 text-sm text-text-2">
            Belum ada template. Buat dari preset, lalu atur slot, overlay, teks, dan font.
          </p>
        )}
      </div>
    </>
  );
}
