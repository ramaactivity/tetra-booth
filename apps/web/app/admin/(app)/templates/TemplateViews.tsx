"use client";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { DesignPreview } from "../events/[id]/settings/DesignPreview";
import { TemplateMenu } from "./TemplateMenu";
import type { AssignEvent, TemplateItem } from "./types";

const VARS = { event_name: "Andi & Sari", date: "12 Oktober 2026" };
const tz = { timeZone: "Asia/Jakarta" } as const;
const day = (ts: string) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", ...tz }).format(new Date(ts));
const dayOf = (ymd: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",

    timeZone: "UTC",
  }).format(new Date(`${ymd}T00:00:00Z`));

type Props = {
  rows: TemplateItem[];
  photobox: boolean;
  maxSessions: number;
  events: AssignEvent[];
};

/** Pratinjau asli (template engine, sama dengan booth & Pengaturan event). */
function Thumb({ t, className = "" }: { t: TemplateItem; className?: string }) {
  return (
    <DesignPreview
      layout={t.layout}
      template={{ id: t.id, version: t.version, files: t.files }}
      vars={VARS}
      alt={`Pratinjau ${t.name}`}
      className={className}
    />
  );
}

/** Batang pemakaian relatif terhadap template paling laris di tab ini. */
function Bar({ n, max }: { n: number; max: number }) {
  return (
    <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-neutral">
      <span
        className="block h-full rounded-full bg-mint"
        style={{ width: `${(100 * n) / max}%` }}
      />
    </span>
  );
}

function Usage({ t, photobox, max }: { t: TemplateItem; photobox: boolean; max: number }) {
  if (!photobox)
    return t.events ? (
      <span className="text-[13px]">
        Dipakai di <b>{t.events}</b> event
        {t.lastEvent && <span className="text-text-2"> · terakhir {dayOf(t.lastEvent)}</span>}
      </span>
    ) : (
      <span className="text-[13px] text-text-2">Belum dipakai event</span>
    );
  return (
    <span className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[13px] tabular-nums" data-testid="tpl-usage">
        {t.sessions ? (
          <>
            <b>{t.sessions}</b> sesi
            <span className="text-text-2">
              {" "}
              · {t.prints} lembar{t.lastUsed ? ` · terakhir ${day(t.lastUsed)}` : ""}
            </span>
          </>
        ) : (
          <span className="text-text-2">Belum dipakai tamu</span>
        )}
      </span>
      <Bar n={t.sessions} max={max} />
    </span>
  );
}

const editBtn =
  "pressable inline-flex h-9 items-center gap-1.5 rounded-[10px] border-[1.5px] border-ink bg-white px-3 text-[13px] font-bold no-underline hover:bg-butter";

export function TemplateGrid({ rows, photobox, maxSessions, events }: Props) {
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(212px,1fr))] gap-4 p-0">
      {rows.map((t) => (
        <li
          key={t.id}
          className="flex flex-col overflow-hidden rounded-2xl border-[1.5px] border-ink bg-white"
        >
          <Link
            href={`/admin/templates/${t.id}`}
            tabIndex={-1}
            aria-hidden
            className="flex h-[200px] items-center justify-center border-b-[1.5px] border-ink bg-paper p-4 hover:bg-neutral"
          >
            <Thumb t={t} className="rounded-[4px]" />
          </Link>
          <div className="flex flex-1 flex-col gap-2.5 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/admin/templates/${t.id}`}
                  className="block truncate text-[15px] font-extrabold tracking-[-0.01em] no-underline hover:underline"
                >
                  {t.name}
                </Link>
                <span className="block truncate text-xs text-text-2">
                  {t.format} · {t.slots} foto · v{t.version} · {day(t.savedAt)}
                </span>
              </div>
            </div>
            <div className="mt-auto border-t-[1.5px] border-dashed border-line-soft pt-2.5">
              <Usage t={t} photobox={photobox} max={maxSessions} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Link
                href={`/admin/templates/${t.id}`}
                aria-label={`Edit ${t.name}`}
                className={editBtn}
              >
                <Pencil aria-hidden className="size-4" strokeWidth={2} />
                Edit desain
              </Link>
              <TemplateMenu t={t} events={events} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TemplateTable({ rows, photobox, maxSessions, events }: Props) {
  const cols = photobox
    ? "lg:grid-cols-[minmax(0,2.4fr)_1fr_1.3fr_.6fr_1fr_150px]"
    : "lg:grid-cols-[minmax(0,2.4fr)_1fr_1.6fr_.9fr_150px]";
  const heads = photobox
    ? ["Nama template", "Format", "Sesi", "Lembar", "Terakhir dipakai", ""]
    : ["Nama template", "Format", "Dipakai", "Disimpan", ""];
  return (
    <div className="overflow-hidden rounded-2xl border-[1.5px] border-ink bg-white">
      <div
        className={`hidden h-[44px] items-center gap-x-5 border-b-[1.5px] border-ink bg-paper px-5 text-xs font-bold text-text-2 lg:grid ${cols}`}
      >
        {heads.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {rows.map((t) => (
        <div
          key={t.id}
          className={`flex flex-wrap items-center gap-x-5 gap-y-2 border-b-[1.5px] border-dashed border-line-soft px-5 py-3 text-sm last:border-b-0 hover:bg-paper lg:grid ${cols}`}
        >
          <Link
            href={`/admin/templates/${t.id}`}
            className="flex w-full min-w-0 items-center gap-3 font-bold no-underline lg:w-auto"
          >
            <span className="flex h-12 w-12 flex-none items-center justify-center">
              <Thumb t={t} className="rounded-[3px]" />
            </span>
            <span className="min-w-0">
              <span className="block truncate">{t.name}</span>
              <span className="block truncate text-xs font-medium text-text-2">
                {t.slots} foto · v{t.version}
              </span>
            </span>
          </Link>
          <span className="text-[13px] text-text-3">{t.format}</span>
          {photobox ? (
            <>
              <span className="flex min-w-[120px] flex-col gap-1.5" data-testid="tpl-usage">
                <span className="text-[13px] tabular-nums">
                  <b>{t.sessions}</b> sesi
                </span>
                <Bar n={t.sessions} max={maxSessions} />
              </span>
              <span className="text-[13px] tabular-nums">
                {t.prints}
                <span className="text-text-2 lg:hidden"> lembar</span>
              </span>
              <span className="text-[13px] text-text-2">
                {t.lastUsed ? day(t.lastUsed) : "Belum pernah"}
              </span>
            </>
          ) : (
            <>
              <Usage t={t} photobox={false} max={maxSessions} />
              <span className="text-[13px] text-text-2">{day(t.savedAt)}</span>
            </>
          )}
          <span className="ml-auto flex items-center justify-end gap-1.5">
            <Link
              href={`/admin/templates/${t.id}`}
              aria-label={`Edit ${t.name}`}
              className={editBtn}
            >
              <Pencil aria-hidden className="size-4" strokeWidth={2} />
              Edit
            </Link>
            <TemplateMenu t={t} events={events} />
          </span>
        </div>
      ))}
    </div>
  );
}
