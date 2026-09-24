import { authUsers } from "@/lib/auth-admin";
import { copy } from "@/lib/copy";
import { ago } from "@/lib/format";
import { requireMember } from "@/lib/supabase/server";
import { InviteButton, MemberMenu } from "./TeamClient";

export const dynamic = "force-dynamic";

const t = copy.admin.team;
const AVATAR = ["bg-peach", "bg-lavender", "bg-sky", "bg-mint-soft", "bg-coral", "bg-butter"];
const ROLE_PILL: Record<string, string> = {
  owner: "bg-butter",
  admin: "bg-lavender",
  crew: "bg-sky",
};
const ACCESS: Record<string, string> = {
  Penuh: "bg-mint-soft",
  Lihat: "bg-sky",
  Tidak: "border-dashed",
};

/** Tim (desain v2 E7): anggota, role, aktif/nonaktif, undang. Hanya owner (RLS members: tulis owner). */
export default async function TeamPage() {
  const { db, orgId, user } = await requireMember(["owner"]);
  const { data: members } = await db
    .from("members")
    .select("id, user_id, role, active, created_at")
    .eq("organization_id", orgId)
    .order("created_at");
  const users = new Map((await authUsers()).map((u) => [u.id, u]));
  const now = Date.now();

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[30px] font-extrabold tracking-[-0.03em]">{t.title}</h1>
        <InviteButton />
      </div>
      <div className="grid grid-cols-1 items-start gap-5 min-[1360px]:grid-cols-[1fr_380px]">
        <div className="overflow-x-auto rounded-[18px] border-[1.5px] border-ink bg-white">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead>
              <tr className="border-b-[1.5px] border-ink text-xs text-text-2">
                {t.cols.map((c) => (
                  <th key={c} className="px-5 py-3.5 font-semibold">
                    {c}
                  </th>
                ))}
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((m, i) => {
                const u = users.get(m.user_id);
                const email = u?.email ?? "";
                const name = String(u?.user_metadata?.name ?? email.split("@")[0]);
                const self = m.user_id === user.id;
                return (
                  <tr
                    key={m.id}
                    data-testid="member-row"
                    className={`border-b border-dashed border-ink last:border-b-0 ${m.active ? "" : "opacity-50"}`}
                  >
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2.5 font-bold">
                        <span
                          className={`flex size-8 flex-none items-center justify-center rounded-full border-[1.5px] border-ink text-xs font-extrabold uppercase ${AVATAR[i % AVATAR.length]}`}
                        >
                          {name[0]}
                        </span>
                        {name} {self && <span className="font-normal text-text-2">{t.you}</span>}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-text-2">{email}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-md border-[1.5px] border-ink px-2 py-0.5 text-xs font-bold ${ROLE_PILL[m.role]}`}
                      >
                        {copy.admin.roles[m.role]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-text-2">
                      {!m.active
                        ? t.inactive
                        : u?.last_sign_in_at
                          ? ago(u.last_sign_in_at, now)
                          : t.never}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {!self && (
                        <MemberMenu id={m.id} email={email} role={m.role} active={m.active} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <section className="overflow-hidden rounded-[18px] border-[1.5px] border-ink bg-white">
          <h2 className="border-b-[1.5px] border-dashed border-ink px-5 py-4 text-base font-extrabold">
            {t.matrixTitle}
          </h2>
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b-[1.5px] border-ink text-xs text-text-2">
                {t.matrixCols.map((c) => (
                  <th key={c} className="px-5 py-2.5 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.matrix.map(([f, ...cells]) => (
                <tr key={f} className="border-b border-dashed border-ink last:border-b-0">
                  <td className="px-5 py-2.5 font-semibold">{f}</td>
                  {cells.map((c, j) => (
                    <td key={t.matrixCols[j + 1]} className="px-5 py-2.5">
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
        </section>
      </div>
    </>
  );
}
