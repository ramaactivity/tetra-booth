import { ChevronDown, CircleHelp, Clock, UserPlus } from "lucide-react";
import { authUsers } from "@/lib/auth-admin";
import { copy } from "@/lib/copy";
import { ago } from "@/lib/format";
import { type Role, requireMember } from "@/lib/supabase/server";
import { ROLE_BG, ROLES, roleAccess } from "./roles";
import { InviteButton, MemberControls } from "./TeamClient";

export const dynamic = "force-dynamic";

const t = copy.admin.team;
const roleName = (r: string) => copy.admin.roles[r] ?? r;
const ACCESS: Record<string, string> = {
  Penuh: "bg-mint-soft",
  Lihat: "bg-sky",
  Tidak: "border-dashed text-text-2",
};

/** Tim (desain v2 E7, dirombak #165): daftar anggota selebar halaman, panduan role di bawah. Hanya owner. */
export default async function TeamPage() {
  const { db, orgId, user } = await requireMember(["owner"]);
  const { data } = await db
    .from("members")
    .select("id, user_id, role, active, created_at")
    .eq("organization_id", orgId)
    .order("created_at");
  const users = new Map((await authUsers()).map((u) => [u.id, u]));
  const now = Date.now();
  const members = (data ?? [])
    .map((m) => {
      const u = users.get(m.user_id);
      const email = u?.email ?? "";
      return {
        id: m.id,
        role: m.role,
        active: m.active,
        email,
        name: String(u?.user_metadata?.name ?? email.split("@")[0]),
        self: m.user_id === user.id,
        lastSeen: u?.last_sign_in_at ?? null,
      };
    })
    // Diri sendiri dulu, lalu per role (Owner → Admin → Crew), urutan bergabung.
    .sort(
      (a, b) =>
        Number(b.self) - Number(a.self) ||
        ROLES.indexOf(a.role as Role) - ROLES.indexOf(b.role as Role),
    );
  const count = (f: (m: (typeof members)[number]) => boolean) => members.filter(f).length;
  const strip = [
    ...ROLES.map((r) => [roleName(r), count((m) => m.role === r), ROLE_BG[r]] as const),
    [t.pending, count((m) => m.active && !m.lastSeen), "bg-peach"] as const,
    [t.inactive, count((m) => !m.active), "bg-neutral"] as const,
  ].filter(([, n], i) => i < 3 || n > 0);

  return (
    <div className="flex w-full max-w-[1080px] flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[30px] font-extrabold tracking-[-0.03em]">{t.title}</h1>
          <p className="mt-1 text-sm text-text-2">{t.subtitle}</p>
        </div>
        <InviteButton />
      </div>

      <section className="@container rounded-[18px] border-[1.5px] border-ink bg-white">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b-[1.5px] border-ink px-5 py-3.5">
          <h2 className="text-base font-extrabold">{t.members(members.length)}</h2>
          <ul className="flex flex-wrap gap-1.5" aria-label="Jumlah per role">
            {strip.map(([label, n, bg]) => (
              <li
                key={label}
                className={`flex items-center gap-1.5 rounded-full border-[1.5px] border-ink px-2.5 py-0.5 text-xs font-bold ${bg}`}
              >
                {label}
                <span className="font-mono">{n}</span>
              </li>
            ))}
          </ul>
        </div>
        <ul>
          {members.map((m) => {
            const pending = m.active && !m.lastSeen;
            return (
              <li
                key={m.id}
                data-testid="member-row"
                className="grid grid-cols-1 gap-3 border-b-[1.5px] border-dashed border-line-soft px-5 py-4 last:border-b-0 @2xl:grid-cols-[minmax(0,1fr)_176px_136px_36px] @2xl:items-center @2xl:gap-4"
              >
                <div className={`flex min-w-0 items-center gap-3 ${m.active ? "" : "opacity-60"}`}>
                  <span
                    aria-hidden
                    className={`flex size-10 flex-none items-center justify-center rounded-full border-[1.5px] border-ink text-sm font-extrabold uppercase ${ROLE_BG[m.role]}`}
                  >
                    {m.name[0]}
                  </span>
                  <div className="min-w-0">
                    <p className="flex gap-1 text-[15px] font-bold">
                      <span className="truncate">{m.name}</span>
                      {m.self && <span className="flex-none font-medium text-text-2">{t.you}</span>}
                    </p>
                    <p className="truncate text-[13px] text-text-2">{m.email}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-[52px] @2xl:contents">
                  <div data-testid="member-status" className="min-w-0 flex-1 @2xl:flex-none">
                    {!m.active ? (
                      <Status
                        bg="bg-neutral border-dashed"
                        label={t.inactive}
                        note={t.inactiveNote}
                      />
                    ) : pending ? (
                      <Status bg="bg-peach" label={t.pending} note={t.pendingNote} icon />
                    ) : (
                      <>
                        <p className="text-xs text-text-2">{t.lastSeen}</p>
                        <p className="text-[13px] font-semibold">
                          {ago(m.lastSeen, now).replace(/^terakhir /, "hari ini ")}
                        </p>
                      </>
                    )}
                  </div>
                  <MemberControls
                    id={m.id}
                    name={m.name}
                    email={m.email}
                    role={m.role}
                    active={m.active}
                    pending={pending}
                    self={m.self}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        {members.length <= 1 && (
          <div className="m-5 mt-0 flex flex-col gap-4 rounded-[14px] border-[1.5px] border-dashed border-ink bg-paper p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-10 flex-none items-center justify-center rounded-full border-[1.5px] border-ink bg-white">
                <UserPlus aria-hidden className="size-5" strokeWidth={2} />
              </span>
              <div>
                <h3 className="text-base font-extrabold">{t.emptyTitle}</h3>
                <p className="mt-1 max-w-[560px] text-sm text-text-2">{t.emptyBody}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
              {(["admin", "crew"] as const).map((r) => (
                <RoleCard key={r} role={r} />
              ))}
            </div>
            <div>
              <InviteButton />
            </div>
          </div>
        )}
      </section>

      <details className="group @container rounded-[18px] border-[1.5px] border-ink bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-base font-extrabold [&::-webkit-details-marker]:hidden">
          <CircleHelp aria-hidden className="size-5 flex-none" strokeWidth={2} />
          <span className="flex-1">{t.guideTitle}</span>
          <ChevronDown
            aria-hidden
            className="size-5 flex-none transition-transform group-open:rotate-180"
            strokeWidth={2}
          />
        </summary>
        <div className="flex flex-col gap-5 border-t-[1.5px] border-dashed border-ink px-5 pt-4 pb-5">
          <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-3">
            {ROLES.map((r) => (
              <RoleCard key={r} role={r} />
            ))}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-extrabold">{t.guideDetail}</h3>
            <table className="w-full max-w-[560px] text-left text-[13px]">
              <thead>
                <tr className="border-b-[1.5px] border-ink text-xs text-text-2">
                  {t.matrixCols.map((c) => (
                    <th key={c} className="py-2 pr-3 font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.matrix.map(([f, ...cells]) => (
                  <tr key={f} className="border-b border-dashed border-line-soft last:border-b-0">
                    <td className="py-2 pr-3 font-semibold">{f}</td>
                    {cells.map((c, j) => (
                      <td key={t.matrixCols[j + 1]} className="py-2 pr-3">
                        <span
                          className={`rounded-md border-[1.5px] border-ink px-2 py-0.5 text-[11px] font-bold ${ACCESS[c]}`}
                        >
                          {c}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </div>
  );
}

function Status({
  bg,
  label,
  note,
  icon,
}: {
  bg: string;
  label: string;
  note: string;
  icon?: boolean;
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <span
        className={`inline-flex items-center gap-1 rounded-full border-[1.5px] border-ink px-2.5 py-0.5 text-xs font-bold ${bg}`}
      >
        {icon && <Clock aria-hidden className="size-3.5" strokeWidth={2.25} />}
        {label}
      </span>
      <span className="text-xs text-text-2">{note}</span>
    </div>
  );
}

/** Ringkasan satu role dalam bahasa sehari-hari + fitur dari matriks. */
function RoleCard({ role }: { role: string }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border-[1.5px] border-ink bg-white p-4">
      <div className="flex items-center gap-2">
        <span
          className={`rounded-md border-[1.5px] border-ink px-2 py-0.5 text-xs font-bold ${ROLE_BG[role]}`}
        >
          {roleName(role)}
        </span>
      </div>
      <p className="text-sm font-semibold">{t.roleInfo[role]}</p>
      <dl className="flex flex-col gap-1.5 text-[13px]">
        {roleAccess(role).map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-text-2">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
