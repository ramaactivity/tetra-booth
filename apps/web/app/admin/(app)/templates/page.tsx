import { paperLabel } from "@tetra/shared";
import { LayoutTemplate } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { StoredLayout, type TemplateMode } from "@/lib/layouts";
import { requireMember } from "@/lib/supabase/server";
import {
  eventUsage,
  type Filters,
  filterSort,
  PAPERS,
  type Sort,
  stats,
  type TemplateRow,
} from "@/lib/template-list";
import { NewTemplateWizard } from "./NewTemplateWizard";
import { TemplateFilters } from "./TemplateFilters";
import { TemplateGrid, TemplateTable } from "./TemplateViews";
import type { AssignEvent, TemplateItem, WizardTemplate } from "./types";

export const dynamic = "force-dynamic";

const ymdWib = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format();
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Daftar template (editor E4, DECISIONS #74) dipisah per mode, dengan statistik & filter (#160). */
export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tab: TemplateMode = one(sp.tab) === "photobox" ? "photobox" : "event";
  const photobox = tab === "photobox";
  const urut = (["nama", "dipakai"].includes(one(sp.urut)) ? one(sp.urut) : "disimpan") as Sort;
  const f: Filters = {
    q: one(sp.q),
    kertas: PAPERS.some(([k]) => k === one(sp.kertas)) ? one(sp.kertas) : "",
    arah: ["portrait", "landscape"].includes(one(sp.arah)) ? one(sp.arah) : "",
    urut,
  };
  const view = (await cookies()).get("tpl_view")?.value === "list" ? "list" : "grid";

  const { db, orgId } = await requireMember(["owner", "admin"]);
  const today = ymdWib();
  const [{ data: layouts }, { data: events }, { data: usage }, { data: presets }] =
    await Promise.all([
      db
        .from("layouts")
        .select("id, name, paper, mode, created_at, layout_versions(version, spec, created_at)")
        .eq("organization_id", orgId)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .order("version", { referencedTable: "layout_versions", ascending: false })
        .limit(1, { referencedTable: "layout_versions" }),
      // ponytail: semua event organisasi (batas baris PostgREST 1000); hitung di SQL kalau event > 1000.
      db
        .from("events")
        .select(
          "id, slug, name, mode, status, event_date, tpl:settings->template, pb:settings->photobox->layouts",
        )
        .eq("organization_id", orgId)
        .order("event_date", { ascending: false }),
      db
        .from("layout_usage")
        .select("layout_id, sessions, prints, sessions_month, last_used_at")
        .eq("organization_id", orgId),
      db
        .from("layout_presets")
        .select("id, name, paper, width, height, slots")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false }),
    ]);

  const used = eventUsage(
    (events ?? []).map((e) => ({
      event_date: e.event_date,
      tpl: e.tpl as { layoutId?: string; versions?: Record<string, number> } | null,
      pb: e.pb as { template?: string }[] | null,
    })),
  );
  const pbUse = new Map((usage ?? []).map((u) => [u.layout_id ?? "", u]));
  const all = (layouts ?? []).flatMap((l) => {
    const v = l.layout_versions[0];
    const spec = StoredLayout.safeParse(v?.spec);
    if (!v || !spec.success) return [];
    const { layout, files } = spec.data;
    const u = used.get(l.id);
    const p = pbUse.get(l.id);
    const item: TemplateItem & TemplateRow & { mode: TemplateMode } = {
      id: l.id,
      name: l.name,
      mode: l.mode === "photobox" ? "photobox" : "event",
      paper: layout.paper,
      landscape: layout.canvas.width > layout.canvas.height,
      format: paperLabel(layout.paper, layout.canvas),
      slots: layout.slots.length,
      version: v.version,
      savedAt: v.created_at,
      layout,
      files: Object.fromEntries(Object.entries(files).map(([k, x]) => [k, x.file])),
      events: u?.events ?? 0,
      lastEvent: u?.last ?? null,
      sessions: p?.sessions ?? 0,
      prints: p?.prints ?? 0,
      sessionsMonth: p?.sessions_month ?? 0,
      lastUsed: p?.last_used_at ?? null,
    };
    return [item];
  });
  const mine = all.filter((t) => t.mode === tab);
  const rows = filterSort(mine, f, photobox);
  const s = stats(mine, today);
  const count = { event: 0, photobox: 0 };
  for (const t of all) count[t.mode]++;
  const maxSessions = Math.max(1, ...mine.map((t) => t.sessions));

  // "Pasang ke event": event mendatang (mode event) / photobox yang masih berjalan.
  const assignable: AssignEvent[] = (events ?? [])
    .filter((e) =>
      e.mode === "photobox"
        ? !["completed", "archived"].includes(e.status)
        : e.event_date >= today && e.status !== "archived",
    )
    .map((e) => ({
      id: e.id,
      slug: e.slug,
      name: e.name,
      date: e.event_date,
      mode: e.mode === "photobox" ? ("photobox" as const) : ("event" as const),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const wizardTemplates: WizardTemplate[] = all.map((t) => ({
    id: t.id,
    name: t.name,
    mode: t.mode,
    layout: t.layout,
    version: t.version,
    files: t.files,
  }));

  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams(
      Object.entries({
        tab,
        q: f.q,
        kertas: f.kertas,
        arah: f.arah,
        urut: f.urut,
        ...patch,
      }).filter(
        ([k, v]) => v && !(k === "tab" && v === "event") && !(k === "urut" && v === "disimpan"),
      ),
    ).toString();
    return p ? `/admin/templates?${p}` : "/admin/templates";
  };
  const filtered = !!(f.q || f.kertas || f.arah);
  const metric = "flex min-w-0 flex-col gap-0.5 px-4 py-3";
  const label = "text-xs font-semibold text-text-2";
  const num = "text-[22px] leading-tight font-extrabold tracking-[-0.03em]";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-extrabold tracking-[-0.03em]">Template</h1>
          <p className="mt-0.5 text-sm text-text-2">
            Desain bingkai foto. Template Event dan Photobox dipisah supaya mudah dicari.
          </p>
        </div>
        <NewTemplateWizard
          mode={tab}
          templates={wizardTemplates}
          presets={(presets ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            paper: p.paper,
            width: p.width,
            height: p.height,
            slots: p.slots as TemplateItem["layout"]["slots"],
          }))}
          events={assignable}
        />
      </div>

      <nav aria-label="Mode template" className="flex">
        <div className="flex overflow-hidden rounded-xl border-[1.5px] border-ink bg-white">
          {(
            [
              ["event", "Event"],
              ["photobox", "Photobox"],
            ] as const
          ).map(([k, l], i) => (
            <Link
              key={k}
              href={k === "event" ? "/admin/templates" : "/admin/templates?tab=photobox"}
              aria-current={k === tab ? "page" : undefined}
              className={`flex h-[40px] items-center gap-2 px-5 text-sm no-underline ${i ? "border-l-[1.5px] border-ink" : ""} ${k === tab ? "bg-lavender font-bold" : "font-semibold hover:bg-paper"}`}
            >
              {l}
              <span className="font-mono text-xs text-text-2">{count[k]}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Strip statistik: angka per kertas sekaligus filter kertas; kanan = pemakaian. */}
      <section
        aria-label="Statistik template"
        className="flex flex-wrap items-stretch overflow-hidden rounded-2xl border-[1.5px] border-ink bg-white"
      >
        <div className="flex flex-wrap">
          {(
            [["", "Semua", s.total], ...PAPERS.map(([k]) => [k, k, s.paper[k]] as const)] as const
          ).map(([k, l, n]) => {
            const on = f.kertas === k;
            return (
              <Link
                key={l}
                href={qs({ kertas: on && k ? "" : k })}
                aria-current={on ? "true" : undefined}
                aria-label={`${l}: ${n} template`}
                className={`${metric} min-w-[96px] border-r-[1.5px] border-dashed border-line-soft no-underline ${on ? "bg-mint-soft" : "hover:bg-paper"}`}
              >
                <span className={label}>{l}</span>
                <span className={num}>{n}</span>
              </Link>
            );
          })}
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap">
          {photobox ? (
            <>
              <div className={`${metric} border-r-[1.5px] border-dashed border-line-soft`}>
                <span className={label}>Sesi bulan ini</span>
                <span className={num} data-testid="stat-month">
                  {s.sessionsMonth}
                </span>
              </div>
              <div className={`${metric} flex-1`}>
                <span className={label}>Terfavorit bulan ini</span>
                {s.top ? (
                  <span
                    className="truncate text-[15px] leading-[29px] font-bold"
                    data-testid="stat-top"
                  >
                    {s.top.name}
                    <span className="ml-2 font-mono text-xs font-medium text-text-2">
                      {s.top.sessionsMonth} sesi
                    </span>
                  </span>
                ) : (
                  <span className="text-sm leading-[29px] text-text-2">
                    Belum ada sesi bulan ini
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className={`${metric} border-r-[1.5px] border-dashed border-line-soft`}>
                <span className={label}>Dipakai event mendatang</span>
                <span className={num}>{s.upcoming}</span>
              </div>
              <div className={metric}>
                <span className={label}>Belum pernah dipakai</span>
                <span className={num}>{s.unused}</span>
              </div>
            </>
          )}
        </div>
      </section>

      <TemplateFilters tab={tab} {...f} view={view} photobox={photobox} />

      {rows.length ? (
        view === "list" ? (
          <TemplateTable
            rows={rows}
            photobox={photobox}
            maxSessions={maxSessions}
            events={assignable}
          />
        ) : (
          <TemplateGrid
            rows={rows}
            photobox={photobox}
            maxSessions={maxSessions}
            events={assignable}
          />
        )
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-ink bg-white px-6 py-12 text-center">
          <LayoutTemplate aria-hidden className="size-6 text-text-2" strokeWidth={2} />
          {filtered ? (
            <>
              <p className="text-sm font-bold">Tidak ada template yang cocok</p>
              <Link href={qs({ q: "", kertas: "", arah: "" })} className="text-sm font-bold">
                Hapus filter
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm font-bold">
                Belum ada template {photobox ? "Photobox" : "Event"}
              </p>
              <p className="max-w-[420px] text-sm text-text-2">
                {photobox
                  ? "Template Photobox dijual di booth berbayar: tamu memilih desain, lalu bayar QRIS. Buat dari tombol Buat Template."
                  : "Template Event dipasang sebagai desain frame acara klien. Buat dari tombol Buat Template."}
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}
