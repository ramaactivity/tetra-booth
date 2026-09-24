"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { copy } from "@/lib/copy";

const items = [
  {
    href: "/admin",
    t: copy.admin.nav.events,
    i: "◷",
    match: (p: string) => p === "/admin" || p.startsWith("/admin/events"),
  },
  {
    href: "/admin/devices",
    t: copy.admin.nav.devices,
    i: "▭",
    match: (p: string) => p.startsWith("/admin/devices"),
  },
  {
    href: "/admin/team",
    t: copy.admin.nav.team,
    i: "☺",
    match: (p: string) => p.startsWith("/admin/team"),
    owner: true,
  },
];

export function Nav({ owner }: { owner: boolean }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1.5">
      {items
        .filter((n) => owner || !n.owner)
        .map((n) => {
          const on = n.match(path);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex h-[42px] items-center gap-2.5 rounded-[11px] border-[1.5px] px-2.5 text-sm no-underline ${on ? "border-ink bg-butter font-bold" : "border-transparent font-medium"}`}
            >
              <span className="w-[22px] text-center">{n.i}</span>
              {n.t}
            </Link>
          );
        })}
    </nav>
  );
}
